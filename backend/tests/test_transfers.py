"""Transferência entre carteiras: o pagamento da fatura do cartão.

O ponto central é o último teste: compra no cartão + pagamento da fatura
precisam contar como UMA despesa no mês. Antes das transferências, o pagamento
era lançado como segunda despesa e o gasto aparecia dobrado.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models.sql_models import User, Wallet
from app.services.goal_service import current_month_range
from app.services.wallet_service import lock_order

HOJE = current_month_range()[0].isoformat()


async def _carteira(ac, name, balance="0.00", kind="ACCOUNT"):
    res = await ac.post("/wallets/", json={"name": name, "balance": balance, "kind": kind})
    assert res.status_code == 201, res.text
    return res.json()


async def _saldo(ac, wallet_id):
    wallets = (await ac.get("/wallets/")).json()
    return float(next(w for w in wallets if w["id"] == wallet_id)["balance"])


async def _transferir(ac, origem, destino, amount="300.00"):
    return await ac.post(
        "/transfers/",
        json={"from_wallet_id": origem, "to_wallet_id": destino, "amount": amount, "date": HOJE},
    )


@pytest.mark.asyncio
async def test_transfer_moves_money_between_the_two_wallets(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta", "1000.00")
    cartao = await _carteira(ac, "Cartão", "-300.00", "CREDIT_CARD")

    res = await _transferir(ac, conta["id"], cartao["id"])
    assert res.status_code == 201, res.text
    assert await _saldo(ac, conta["id"]) == 700.0
    assert await _saldo(ac, cartao["id"]) == 0.0


@pytest.mark.asyncio
async def test_deleting_a_transfer_undoes_both_sides(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta", "1000.00")
    cartao = await _carteira(ac, "Cartão", "-300.00", "CREDIT_CARD")
    t = (await _transferir(ac, conta["id"], cartao["id"])).json()

    res = await ac.delete(f"/transfers/{t['id']}")
    assert res.status_code == 204
    assert await _saldo(ac, conta["id"]) == 1000.0
    assert await _saldo(ac, cartao["id"]) == -300.0


@pytest.mark.asyncio
async def test_list_returns_transfers_where_the_wallet_is_either_side(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta", "1000.00")
    cartao = await _carteira(ac, "Cartão", "0.00", "CREDIT_CARD")
    outra = await _carteira(ac, "Outra", "10.00")
    await _transferir(ac, conta["id"], cartao["id"], "100.00")

    assert len((await ac.get("/transfers/", params={"wallet_id": cartao["id"]})).json()) == 1
    assert len((await ac.get("/transfers/", params={"wallet_id": conta["id"]})).json()) == 1
    assert (await ac.get("/transfers/", params={"wallet_id": outra["id"]})).json() == []


@pytest.mark.asyncio
async def test_same_wallet_on_both_sides_is_rejected(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta", "1000.00")
    res = await _transferir(ac, conta["id"], conta["id"])
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_non_positive_amount_is_rejected(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta", "1000.00")
    cartao = await _carteira(ac, "Cartão", "0.00", "CREDIT_CARD")
    assert (await _transferir(ac, conta["id"], cartao["id"], "0")).status_code == 422
    assert (await _transferir(ac, conta["id"], cartao["id"], "-5.00")).status_code == 422


@pytest.mark.asyncio
async def test_someone_elses_wallet_on_either_side_is_404(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    da_alice = await _carteira(alice, "Conta", "1000.00")
    do_bob = await _carteira(bob, "Cartão", "0.00", "CREDIT_CARD")

    assert (await _transferir(alice, da_alice["id"], do_bob["id"])).status_code == 404
    assert (await _transferir(alice, do_bob["id"], da_alice["id"])).status_code == 404
    # Nenhuma ponta mudou.
    assert await _saldo(alice, da_alice["id"]) == 1000.0
    assert await _saldo(bob, do_bob["id"]) == 0.0


@pytest.mark.asyncio
async def test_someone_elses_transfer_cannot_be_deleted(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    conta = await _carteira(alice, "Conta", "1000.00")
    cartao = await _carteira(alice, "Cartão", "0.00", "CREDIT_CARD")
    t = (await _transferir(alice, conta["id"], cartao["id"])).json()

    assert (await bob.delete(f"/transfers/{t['id']}")).status_code == 404
    assert (await bob.delete(f"/transfers/{uuid.uuid4()}")).status_code == 404


@pytest.mark.asyncio
async def test_deleting_the_card_keeps_the_payment_in_the_account(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta", "1000.00")
    cartao = await _carteira(ac, "Cartão", "-300.00", "CREDIT_CARD")
    await _transferir(ac, conta["id"], cartao["id"])

    assert (await ac.delete(f"/wallets/{cartao['id']}")).status_code == 204
    # O dinheiro de fato saiu da conta: o saldo não volta.
    assert await _saldo(ac, conta["id"]) == 700.0
    assert (await ac.get("/transfers/", params={"wallet_id": conta["id"]})).json() == []


@pytest.mark.asyncio
async def test_deleting_the_same_transfer_twice_only_undoes_it_once(make_auth_client):
    # Regressão: o segundo DELETE não pode desfazer o efeito de novo. O lock na
    # linha da transferência (ver routers/transfers.py) é o que impede a
    # duplicação quando dois DELETEs concorrentes leem a mesma linha antes de
    # qualquer um dos dois travar as carteiras.
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta", "1000.00")
    cartao = await _carteira(ac, "Cartão", "-300.00", "CREDIT_CARD")
    t = (await _transferir(ac, conta["id"], cartao["id"])).json()

    assert (await ac.delete(f"/transfers/{t['id']}")).status_code == 204
    assert (await ac.delete(f"/transfers/{t['id']}")).status_code == 404
    assert await _saldo(ac, conta["id"]) == 1000.0
    assert await _saldo(ac, cartao["id"]) == -300.0


def test_wallets_are_locked_in_a_fixed_order():
    # A→B e B→A travando em ordens opostas dariam deadlock no Postgres.
    a, b = uuid.uuid4(), uuid.uuid4()
    assert lock_order(a, b) == lock_order(b, a)


@pytest.mark.asyncio
async def test_card_purchase_plus_invoice_payment_counts_as_one_expense(make_auth_client):
    ac = await make_auth_client()
    conta = await _carteira(ac, "Conta", "1000.00")
    cartao = await _carteira(ac, "Cartão", "0.00", "CREDIT_CARD")

    compra = await ac.post(
        "/transactions/",
        json={
            "wallet_id": cartao["id"],
            "type": "EXPENSE",
            "amount": "300.00",
            "category": "Alimentação",
            "date": HOJE,
        },
    )
    assert compra.status_code == 201, compra.text
    assert (await _transferir(ac, conta["id"], cartao["id"])).status_code == 201

    resumo = (await ac.get("/dashboard/summary")).json()
    assert float(resumo["month_expenses"]) == 300.0
    assert float(resumo["month_income"]) == 0.0
    assert await _saldo(ac, conta["id"]) == 700.0
    assert await _saldo(ac, cartao["id"]) == 0.0


# --- paywall (ADR 0002) ---------------------------------------------------

BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


async def _tres_carteiras(ac, db_session):
    """[antiga, meio, nova]; a nova passa do teto e fica bloqueada."""
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
async def test_blocked_destination_is_refused(make_auth_client, db_session, paywall_ligado):
    ac = await make_auth_client()
    antiga, _meio, nova = await _tres_carteiras(ac, db_session)

    res = await _transferir(ac, str(antiga.id), str(nova.id), "10.00")
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "WALLET_READ_ONLY"
    # Recusada de ponta a ponta: nem a origem, que só doaria, se mexe.
    assert await _saldo(ac, str(antiga.id)) == 100.0


@pytest.mark.asyncio
async def test_blocked_origin_can_be_drained(make_auth_client, db_session, paywall_ligado):
    ac = await make_auth_client()
    antiga, _meio, nova = await _tres_carteiras(ac, db_session)

    res = await _transferir(ac, str(nova.id), str(antiga.id), "10.00")
    assert res.status_code == 201, res.text
    assert await _saldo(ac, str(nova.id)) == 90.0
    assert await _saldo(ac, str(antiga.id)) == 110.0


@pytest.mark.asyncio
async def test_deleting_a_transfer_is_allowed_even_if_destination_became_blocked(
    make_auth_client, db_session
):
    # Cria com o paywall desligado (default da suíte), depois liga o flag: o
    # delete não pode passar a recusar uma transferência que já existia,
    # senão desfazer (sempre permitido, igual excluir transação) quebraria
    # assim que o dono da carteira estourasse o teto.
    ac = await make_auth_client()
    antiga, _meio, nova = await _tres_carteiras(ac, db_session)
    t = (await _transferir(ac, str(antiga.id), str(nova.id), "10.00")).json()

    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    try:
        res = await ac.delete(f"/transfers/{t['id']}")
    finally:
        settings.paywall_enabled = antes

    assert res.status_code == 204
