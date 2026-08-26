"""Teto de carteiras do ADR 0002 (issue #86).

Free = 2 carteiras. As 2 MAIS ANTIGAS nunca são bloqueadas; as demais ficam
somente-leitura, mas continuam visíveis e continuam contando nos totais.
Vocabulário em CONTEXT.md.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models.sql_models import User, Wallet

BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


@pytest.fixture
def paywall_ligado():
    # O flag nasce desligado; ligar por teste é o que prova que desligado o app
    # se comporta como antes (o resto da suíte roda com ele off).
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


async def _tres_carteiras(ac, db_session) -> list[Wallet]:
    """Três carteiras com created_at distinto e crescente: [antiga, meio, nova]."""
    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()
    carteiras = []
    for i, nome in enumerate(("Antiga", "Meio", "Nova")):
        w = Wallet(user_id=user.id, name=nome, balance=100, created_at=BASE + timedelta(days=i))
        db_session.add(w)
        carteiras.append(w)
    await db_session.commit()
    for w in carteiras:
        await db_session.refresh(w)
    return carteiras


@pytest.mark.asyncio
async def test_a_free_user_cannot_write_to_the_wallet_past_the_cap(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    _antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    res = await alice.post(
        "/transactions/",
        json={
            "wallet_id": str(nova.id),
            "type": "EXPENSE",
            "amount": 10,
            "category": "Alimentação",
            "date": "2026-08-26",
        },
    )
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "WALLET_READ_ONLY"


async def _nova_transacao(ac, wallet_id, valor=10):
    return await ac.post(
        "/transactions/",
        json={
            "wallet_id": str(wallet_id),
            "type": "EXPENSE",
            "amount": valor,
            "category": "Alimentação",
            "date": "2026-08-26",
        },
    )


@pytest.mark.asyncio
async def test_the_two_oldest_wallets_stay_writable(make_auth_client, db_session, paywall_ligado):
    alice = await make_auth_client("Alice")
    antiga, meio, _nova = await _tres_carteiras(alice, db_session)

    assert (await _nova_transacao(alice, antiga.id)).status_code == 201
    assert (await _nova_transacao(alice, meio.id)).status_code == 201


@pytest.mark.asyncio
async def test_a_blocked_wallet_is_still_visible_and_still_counts(
    make_auth_client, db_session, paywall_ligado
):
    # Decisão travada do #15: carteira excedente é somente-leitura mas CONTINUA
    # contando em todo total. Filtrar na query teria quebrado isto.
    alice = await make_auth_client("Alice")
    await _tres_carteiras(alice, db_session)

    lista = await alice.get("/wallets/")
    assert lista.status_code == 200
    assert len(lista.json()) == 3


@pytest.mark.asyncio
async def test_a_free_user_cannot_create_a_third_wallet(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    await _tres_carteiras(alice, db_session)

    res = await alice.post("/wallets/", json={"name": "Quarta", "balance": 0})
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "WALLET_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_renaming_a_blocked_wallet_is_refused(make_auth_client, db_session, paywall_ligado):
    alice = await make_auth_client("Alice")
    _antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    res = await alice.put(f"/wallets/{nova.id}", json={"name": "Outro nome"})
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "WALLET_READ_ONLY"


@pytest.mark.asyncio
async def test_deleting_a_blocked_wallet_is_always_allowed(
    make_auth_client, db_session, paywall_ligado
):
    # A saída de quem tem 5 carteiras e virou free. Recusar transformaria o teto
    # numa armadilha.
    alice = await make_auth_client("Alice")
    _antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    assert (await alice.delete(f"/wallets/{nova.id}")).status_code == 204


@pytest.mark.asyncio
async def test_a_transaction_can_be_drained_out_of_a_blocked_wallet(
    make_auth_client, db_session, paywall_ligado
):
    # Excluir carteira apaga as transações por cascade. Sem drenagem, a escolha
    # do usuário seria pagar ou destruir histórico.
    alice = await make_auth_client("Alice")
    antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    # A transação nasce ANTES do paywall valer para ela: criada direto no banco.
    from app.models.sql_models import Transaction, TransactionType
    import datetime as dt

    t = Transaction(
        user_id=(await alice.get("/auth/me")).json()["id"],
        wallet_id=nova.id,
        type=TransactionType.EXPENSE,
        amount=10,
        category="Alimentação",
        date=dt.date(2026, 8, 26),
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)

    mover = await alice.put(f"/transactions/{t.id}", json={"wallet_id": str(antiga.id)})
    assert mover.status_code == 200, mover.text


@pytest.mark.asyncio
async def test_a_transaction_cannot_be_moved_into_a_blocked_wallet(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    criada = await _nova_transacao(alice, antiga.id)
    assert criada.status_code == 201

    mover = await alice.put(
        f"/transactions/{criada.json()['id']}", json={"wallet_id": str(nova.id)}
    )
    assert mover.status_code == 403
    assert mover.json()["detail"]["code"] == "WALLET_READ_ONLY"


@pytest.mark.asyncio
async def test_a_premium_user_has_no_cap_at_all(make_auth_client, db_session, paywall_ligado):
    from datetime import datetime as dt, timedelta as td, timezone as tz

    alice = await make_auth_client("Alice")
    _antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    me = (await alice.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()
    user.premium_until = dt.now(tz.utc) + td(days=30)
    await db_session.commit()

    assert (await _nova_transacao(alice, nova.id)).status_code == 201
    assert (await alice.post("/wallets/", json={"name": "Quarta", "balance": 0})).status_code == 201


@pytest.mark.asyncio
async def test_wallets_created_in_the_same_instant_get_a_stable_order(
    make_auth_client, db_session, paywall_ligado
):
    # created_at empata (o seed de demo cria carteiras na mesma transação). Sem o
    # desempate por id, o conjunto bloqueado mudaria entre requisições: escreve
    # numa carteira agora, 403 na próxima, sem nada ter mudado.
    alice = await make_auth_client("Alice")
    me = (await alice.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()

    empatadas = [Wallet(user_id=user.id, name=f"W{i}", balance=0, created_at=BASE) for i in range(3)]
    db_session.add_all(empatadas)
    await db_session.commit()
    for w in empatadas:
        await db_session.refresh(w)

    # Duas escritas seguidas na MESMA carteira têm que dar o mesmo resultado.
    por_id = sorted(empatadas, key=lambda w: str(w.id))
    primeira = await _nova_transacao(alice, por_id[0].id)
    segunda = await _nova_transacao(alice, por_id[0].id)
    assert primeira.status_code == segunda.status_code == 201

    bloqueada_1 = await _nova_transacao(alice, por_id[2].id)
    bloqueada_2 = await _nova_transacao(alice, por_id[2].id)
    assert bloqueada_1.status_code == bloqueada_2.status_code == 403


@pytest.mark.asyncio
async def test_with_the_flag_off_nothing_is_blocked(make_auth_client, db_session):
    # Sem a fixture paywall_ligado: é o estado de produção no merge deste ticket.
    alice = await make_auth_client("Alice")
    _antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    assert (await _nova_transacao(alice, nova.id)).status_code == 201
    assert (await alice.post("/wallets/", json={"name": "Quarta", "balance": 0})).status_code == 201
    assert (await alice.put(f"/wallets/{nova.id}", json={"name": "Ok"})).status_code == 200


@pytest.mark.asyncio
async def test_editing_a_transaction_that_stays_in_a_blocked_wallet_is_refused(
    make_auth_client, db_session, paywall_ligado
):
    # Ficar na carteira bloqueada é escrever nela. É o outro lado da regra
    # direcional: sair dela é drenar e passa, ficar e mexer no valor não.
    from app.models.sql_models import Transaction, TransactionType
    import datetime as dt

    alice = await make_auth_client("Alice")
    _antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    t = Transaction(
        user_id=(await alice.get("/auth/me")).json()["id"],
        wallet_id=nova.id,
        type=TransactionType.EXPENSE,
        amount=10,
        category="Alimentação",
        date=dt.date(2026, 8, 26),
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)

    res = await alice.put(f"/transactions/{t.id}", json={"amount": 99})
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "WALLET_READ_ONLY"


@pytest.mark.asyncio
async def test_a_transaction_can_be_deleted_from_inside_a_blocked_wallet(
    make_auth_client, db_session, paywall_ligado
):
    from app.models.sql_models import Transaction, TransactionType
    import datetime as dt

    alice = await make_auth_client("Alice")
    _antiga, _meio, nova = await _tres_carteiras(alice, db_session)

    t = Transaction(
        user_id=(await alice.get("/auth/me")).json()["id"],
        wallet_id=nova.id,
        type=TransactionType.EXPENSE,
        amount=10,
        category="Alimentação",
        date=dt.date(2026, 8, 26),
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)

    assert (await alice.delete(f"/transactions/{t.id}")).status_code == 204
