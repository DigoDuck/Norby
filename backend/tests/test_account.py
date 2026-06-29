import pytest


async def make_wallet(ac, name="Main", balance=100):
    res = await ac.post("/wallets/", json={"name": name, "balance": balance})
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_export_contains_own_data_only(make_auth_client, mongo):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    await make_wallet(alice, name="Carteira Alice")
    await make_wallet(bob, name="Carteira Bob")

    res = await alice.get("/auth/me/export")
    assert res.status_code == 200
    assert "attachment" in res.headers.get("content-disposition", "")

    data = res.json()
    names = [w["name"] for w in data["wallets"]]
    assert "Carteira Alice" in names
    assert "Carteira Bob" not in names  # não vaza dado de outro usuário
    assert data["profile"]["email"]
    # estrutura esperada do dump
    for key in ("transactions", "recurring_transactions", "goals", "ai_insights", "chat_history"):
        assert key in data


@pytest.mark.asyncio
async def test_delete_requires_confirmation(make_auth_client):
    alice = await make_auth_client("Alice")
    res = await alice.request("DELETE", "/auth/me", json={"confirm": False})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_delete_account_wipes_postgres_and_mongo(make_auth_client, client, mongo):
    alice = await make_auth_client("Alice")
    me = (await alice.get("/auth/me")).json()
    user_id, email = me["id"], me["email"]

    await make_wallet(alice)
    await mongo["chat_history"].insert_one(
        {"user_id": user_id, "session_id": "s1", "messages": []}
    )
    await mongo["ai_insights"].insert_one(
        {"user_id": user_id, "reference_month": "2026-06"}
    )

    res = await alice.request("DELETE", "/auth/me", json={"confirm": True})
    assert res.status_code == 204

    # Mongo: nada do usuário permanece.
    assert await mongo["chat_history"].count_documents({"user_id": user_id}) == 0
    assert await mongo["ai_insights"].count_documents({"user_id": user_id}) == 0

    # Postgres: a conta sumiu → login com as mesmas credenciais falha.
    login = await client.post("/auth/login", json={"email": email, "password": "secret123"})
    assert login.status_code == 401
