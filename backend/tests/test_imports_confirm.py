"""Confirmar a importação: grava o que a pessoa revisou, tudo ou nada."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.config import get_settings
from app.models.sql_models import Transaction, Transfer, User, Wallet

BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _linha(**extra):
    base = {
        "date": "2026-08-10", "description": "Mercado", "amount": "52.30",
        "direction": "OUT", "launch_as": "EXPENSE", "category": "Alimentação",
    }
    return {**base, **extra}


async def _carteira(ac, nome, balance="1000.00", kind="ACCOUNT"):
    return (await ac.post("/wallets/", json={"name": nome, "balance": balance, "kind": kind})).json()


async def _saldo(ac, wallet_id):
    return float(next(w for w in (await ac.get("/wallets/")).json() if w["id"] == wallet_id)["balance"])


async def _confirmar(ac, wallet_id, items, already=False):
    return await ac.post("/imports/statement/confirm", json={
        "wallet_id": wallet_id, "already_in_balance": already, "items": items,
    })


async def _contagem(db_session, model):
    return await db_session.scalar(select(func.count()).select_from(model))


@pytest.mark.asyncio
async def test_lines_move_the_balance_when_not_already_in_it(make_auth_client, db_session):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta")

    res = await _confirmar(ac, conta["id"], [
        _linha(),
        _linha(description="Salário", amount="3000.00", direction="IN", launch_as="INCOME", category="Salário"),
    ])

    assert res.status_code == 201, res.text
    assert res.json() == {"transactions": 2, "transfers": 0}
    assert await _saldo(ac, conta["id"]) == 1000 - 52.30 + 3000
    assert await _contagem(db_session, Transaction) == 2


@pytest.mark.asyncio
async def test_already_in_balance_records_history_without_moving_the_balance(make_auth_client, db_session):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta")

    res = await _confirmar(ac, conta["id"], [_linha()], already=True)

    assert res.status_code == 201
    assert await _saldo(ac, conta["id"]) == 1000.0
    assert await _contagem(db_session, Transaction) == 1


@pytest.mark.asyncio
async def test_invoice_payment_becomes_a_transfer_to_the_card(make_auth_client, db_session):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta")
    cartao = await _carteira(ac, "Cartão", "-300.00", "CREDIT_CARD")

    res = await _confirmar(ac, conta["id"], [_linha(
        description="Pagamento de fatura", amount="300.00",
        launch_as="TRANSFER", category=None, transfer_wallet_id=cartao["id"],
    )])

    assert res.json() == {"transactions": 0, "transfers": 1}
    assert await _saldo(ac, conta["id"]) == 700.0
    assert await _saldo(ac, cartao["id"]) == 0.0
    assert await _contagem(db_session, Transaction) == 0


@pytest.mark.asyncio
async def test_incoming_transfer_goes_from_the_other_wallet_to_this_one(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta")
    reserva = await _carteira(ac, "Reserva", "500.00")

    await _confirmar(ac, conta["id"], [_linha(
        description="Resgate", amount="200.00", direction="IN",
        launch_as="TRANSFER", category=None, transfer_wallet_id=reserva["id"],
    )])

    assert await _saldo(ac, conta["id"]) == 1200.0
    assert await _saldo(ac, reserva["id"]) == 300.0


@pytest.mark.asyncio
async def test_already_in_balance_leaves_both_transfer_ends_untouched(make_auth_client, db_session):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta")
    cartao = await _carteira(ac, "Cartão", "0.00", "CREDIT_CARD")

    await _confirmar(ac, conta["id"], [_linha(
        amount="300.00", launch_as="TRANSFER", category=None, transfer_wallet_id=cartao["id"],
    )], already=True)

    assert await _saldo(ac, conta["id"]) == 1000.0
    assert await _saldo(ac, cartao["id"]) == 0.0
    assert await _contagem(db_session, Transfer) == 1


@pytest.mark.asyncio
async def test_someone_elses_wallet_is_404_and_nothing_is_written(make_auth_client, db_session):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    da_alice = await _carteira(alice, "Conta")
    do_bob = await _carteira(bob, "Conta do Bob")

    assert (await _confirmar(alice, do_bob["id"], [_linha()])).status_code == 404
    res = await _confirmar(alice, da_alice["id"], [
        _linha(),
        _linha(launch_as="TRANSFER", category=None, transfer_wallet_id=do_bob["id"]),
    ])
    assert res.status_code == 404
    assert await _contagem(db_session, Transaction) == 0
    assert await _saldo(alice, da_alice["id"]) == 1000.0


@pytest.mark.asyncio
async def test_invalid_lines_are_422(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta")

    categoria_de_receita_em_despesa = _linha(category="Salário")
    transferencia_sem_destino = _linha(launch_as="TRANSFER", category=None)
    transferencia_para_si = _linha(launch_as="TRANSFER", category=None, transfer_wallet_id=conta["id"])
    for linha in (categoria_de_receita_em_despesa, transferencia_sem_destino, transferencia_para_si):
        assert (await _confirmar(ac, conta["id"], [linha])).status_code == 422, linha

    assert (await _confirmar(ac, conta["id"], [])).status_code == 422
    assert (await _confirmar(ac, conta["id"], [_linha()] * 301)).status_code == 422
    assert (await _confirmar(ac, conta["id"], [_linha(amount="0")])).status_code == 422


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


@pytest.mark.asyncio
async def test_blocked_wallet_is_refused_and_nothing_is_written(make_auth_client, db_session, paywall_ligado):
    ac = await make_auth_client()
    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()
    carteiras = []
    for i, nome in enumerate(("Antiga", "Meio", "Nova")):
        w = Wallet(user_id=user.id, name=nome, balance=100, created_at=BASE + timedelta(days=i))
        db_session.add(w)
        carteiras.append(w)
    await db_session.commit()
    antiga, nova = carteiras[0], carteiras[2]
    await db_session.refresh(antiga)
    await db_session.refresh(nova)

    # Bloqueada como carteira "Lançar em".
    res = await _confirmar(ac, str(nova.id), [_linha()])
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "WALLET_READ_ONLY"

    # Bloqueada como destino de uma transferência, com a principal liberada.
    res = await _confirmar(ac, str(antiga.id), [
        _linha(),
        _linha(launch_as="TRANSFER", category=None, transfer_wallet_id=str(nova.id)),
    ])
    assert res.status_code == 403
    assert await _contagem(db_session, Transaction) == 0
