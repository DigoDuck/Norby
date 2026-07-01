import asyncio

import pytest


async def make_wallet(ac, name="Main", balance=100):
    res = await ac.post("/wallets/", json={"name": name, "balance": balance})
    assert res.status_code == 201, res.text
    return res.json()


def tx_payload(wallet_id, **over):
    base = {
        "wallet_id": wallet_id,
        "type": "EXPENSE",
        "amount": "30.00",
        "category": "Food",
        "description": "Lunch",
        "date": "2026-06-10",
    }
    base.update(over)
    return base


@pytest.mark.asyncio
async def test_create_expense_decreases_balance(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    res = await ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00"))
    assert res.status_code == 201
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 70.0


@pytest.mark.asyncio
async def test_date_is_returned_as_calendar_date_without_shift(make_auth_client):
    # A data é um dia de calendário: o que entra deve voltar igual, sem fuso.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    res = await ac.post("/transactions/", json=tx_payload(w["id"], date="2026-06-30"))
    assert res.status_code == 201, res.text
    assert res.json()["date"] == "2026-06-30"


@pytest.mark.asyncio
async def test_create_income_increases_balance(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    await ac.post("/transactions/", json=tx_payload(w["id"], type="INCOME", amount="50.00"))
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 150.0


@pytest.mark.asyncio
async def test_update_amount_adjusts_balance(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    tx = (await ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00"))).json()
    # 100 - 30 = 70; muda p/ 50 → 100 - 50 = 50
    res = await ac.put(f"/transactions/{tx['id']}", json={"amount": "50.00"})
    assert res.status_code == 200
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 50.0


@pytest.mark.asyncio
async def test_delete_reverts_balance(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    tx = (await ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00"))).json()
    res = await ac.delete(f"/transactions/{tx['id']}")
    assert res.status_code == 204
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 100.0


@pytest.mark.asyncio
async def test_user_cannot_create_tx_in_other_users_wallet(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    w_alice = await make_wallet(alice)
    res = await bob.post("/transactions/", json=tx_payload(w_alice["id"]))
    assert res.status_code == 404  # carteira não é do Bob


@pytest.mark.asyncio
async def test_user_cannot_update_other_users_tx(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    w = await make_wallet(alice)
    tx = (await alice.post("/transactions/", json=tx_payload(w["id"]))).json()
    res = await bob.put(f"/transactions/{tx['id']}", json={"amount": "1.00"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_concurrent_transactions_do_not_lose_wallet_balance_updates(make_auth_client):
    # Duas transações simultâneas na MESMA carteira: sem lock (with_for_update),
    # ambas leem o saldo antigo e a última sobrescreve a outra (lost update).
    # Cada request usa sua própria sessão/transação (_override_get_db), então o
    # gather abre duas transações concorrentes de verdade no Postgres.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)

    res_a, res_b = await asyncio.gather(
        ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00")),
        ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00")),
    )
    assert res_a.status_code == 201, res_a.text
    assert res_b.status_code == 201, res_b.text

    wallets = (await ac.get("/wallets/")).json()
    # 100 - 30 - 30 = 40. Sem o lock, o saldo ficaria em 70 (uma das saídas some).
    assert float(wallets[0]["balance"]) == 40.0


@pytest.mark.asyncio
async def test_list_respects_limit_and_offset(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=1000)
    for i in range(5):
        await ac.post("/transactions/", json=tx_payload(w["id"], amount="10.00", date=f"2026-06-0{i+1}"))

    page1 = (await ac.get("/transactions/?limit=2&offset=0")).json()
    page2 = (await ac.get("/transactions/?limit=2&offset=2")).json()
    assert len(page1) == 2
    assert len(page2) == 2
    # Páginas consecutivas não se sobrepõem.
    assert {t["id"] for t in page1}.isdisjoint({t["id"] for t in page2})


@pytest.mark.asyncio
async def test_list_is_scoped_to_user(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    w = await make_wallet(alice)
    await alice.post("/transactions/", json=tx_payload(w["id"]))
    assert len((await alice.get("/transactions/")).json()) == 1
    assert len((await bob.get("/transactions/")).json()) == 0
