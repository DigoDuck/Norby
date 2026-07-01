import pytest


async def make_wallet(ac, name="Main", balance="100.00"):
    res = await ac.post("/wallets/", json={"name": name, "balance": balance})
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_create_wallet_returns_fields(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, name="Nubank", balance="250.00")
    assert w["name"] == "Nubank"
    assert float(w["balance"]) == 250.0
    assert "id" in w and "created_at" in w


@pytest.mark.asyncio
async def test_list_is_scoped_to_user(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    await make_wallet(alice, name="Alice Wallet")
    assert len((await alice.get("/wallets/")).json()) == 1
    assert len((await bob.get("/wallets/")).json()) == 0


@pytest.mark.asyncio
async def test_update_own_wallet_name(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac)
    res = await ac.put(f"/wallets/{w['id']}", json={"name": "Renomeada"})
    assert res.status_code == 200
    assert res.json()["name"] == "Renomeada"


@pytest.mark.asyncio
async def test_user_cannot_update_other_users_wallet(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    w = await make_wallet(alice)
    res = await bob.put(f"/wallets/{w['id']}", json={"name": "Hijack"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_user_cannot_delete_other_users_wallet(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    w = await make_wallet(alice)
    res = await bob.delete(f"/wallets/{w['id']}")
    assert res.status_code == 404
    # A carteira da Alice continua lá.
    assert len((await alice.get("/wallets/")).json()) == 1


@pytest.mark.asyncio
async def test_delete_own_wallet(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac)
    res = await ac.delete(f"/wallets/{w['id']}")
    assert res.status_code == 204
    assert len((await ac.get("/wallets/")).json()) == 0
