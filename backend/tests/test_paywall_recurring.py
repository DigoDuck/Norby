"""Recorrência apontando para carteira bloqueada (ADR 0002, issue #88).

`materialize_due_recurring` cria transação e mexe em saldo SOZINHO, em toda
navegação — o AppLayout chama `/recurring/run` no mount de toda rota protegida.
Uma recorrência numa carteira bloqueada é escrita automática numa carteira
bloqueada, acontecendo sem ninguém clicar.

Ela é pulada E DITA. Parar em silêncio seria a pessoa descobrindo em março que
o aluguel não é lançado desde janeiro.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models.sql_models import (
    RecurrenceFrequency,
    RecurringTransaction,
    Transaction,
    TransactionType,
    User,
    Wallet,
)

BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


async def _cenario(ac, db_session):
    """Free com 3 carteiras e uma recorrência VENCIDA na bloqueada (a mais nova)."""
    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()

    carteiras = [
        Wallet(user_id=user.id, name=n, balance=Decimal("100.00"), created_at=BASE + timedelta(days=i))
        for i, n in enumerate(("Antiga", "Meio", "Nova"))
    ]
    db_session.add_all(carteiras)
    await db_session.commit()
    for w in carteiras:
        await db_session.refresh(w)

    bloqueada = carteiras[2]
    tpl = RecurringTransaction(
        user_id=user.id,
        wallet_id=bloqueada.id,
        type=TransactionType.EXPENSE,
        amount=Decimal("10.00"),
        category="Moradia",
        description="Aluguel",
        frequency=RecurrenceFrequency.MONTHLY,
        day_of_month=1,
        next_run_date=datetime.now(timezone.utc) - timedelta(days=1),
    )
    db_session.add(tpl)
    await db_session.commit()
    await db_session.refresh(tpl)
    return user, carteiras, tpl


@pytest.mark.asyncio
async def test_a_recurring_on_a_blocked_wallet_is_skipped_and_reported(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    user, carteiras, tpl = await _cenario(alice, db_session)
    bloqueada = carteiras[2]

    res = await alice.post("/recurring/run")
    assert res.status_code == 200, res.text
    corpo = res.json()

    assert corpo["generated"] == 0
    # Pular em silêncio é o defeito que este ticket existe para evitar.
    assert len(corpo["skipped"]) == 1
    pulada = corpo["skipped"][0]
    assert pulada["recurring_id"] == str(tpl.id)
    assert pulada["wallet_id"] == str(bloqueada.id)
    assert pulada["code"] == "WALLET_READ_ONLY"

    # Nada foi escrito: nem transação, nem saldo, nem avanço da data.
    txs = (
        await db_session.execute(select(Transaction).where(Transaction.user_id == user.id))
    ).scalars().all()
    assert txs == []
    await db_session.refresh(bloqueada)
    assert bloqueada.balance == Decimal("100.00")
    await db_session.refresh(tpl)
    assert tpl.next_run_date < datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_a_recurring_on_a_writable_wallet_still_materializes(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    user, carteiras, tpl = await _cenario(alice, db_session)

    # Move o template para a carteira mais antiga, que nunca é bloqueada.
    tpl.wallet_id = carteiras[0].id
    await db_session.commit()

    corpo = (await alice.post("/recurring/run")).json()
    assert corpo["generated"] >= 1
    assert corpo["skipped"] == []


@pytest.mark.asyncio
async def test_the_template_is_not_deactivated_and_resumes_after_upgrading(
    make_auth_client, db_session, paywall_ligado
):
    # O template não é apagado nem desativado: quem assina (ou drena e apaga uma
    # carteira) volta a materializar sozinho, e as ocorrências puladas entram na
    # próxima rodada, porque a materialização é guiada por data e não por execução.
    alice = await make_auth_client("Alice")
    user, _carteiras, tpl = await _cenario(alice, db_session)

    assert (await alice.post("/recurring/run")).json()["generated"] == 0
    await db_session.refresh(tpl)
    assert tpl.active is True

    user.premium_until = datetime.now(timezone.utc) + timedelta(days=30)
    await db_session.commit()

    depois = (await alice.post("/recurring/run")).json()
    assert depois["generated"] >= 1
    assert depois["skipped"] == []


@pytest.mark.asyncio
async def test_with_the_flag_off_nothing_is_ever_skipped(make_auth_client, db_session):
    alice = await make_auth_client("Alice")
    await _cenario(alice, db_session)

    corpo = (await alice.post("/recurring/run")).json()
    assert corpo["generated"] >= 1
    assert corpo["skipped"] == []
