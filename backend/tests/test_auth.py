import pytest

REG = {"name": "Alice", "email": "alice@test.com", "password": "secret123"}


@pytest.mark.asyncio
async def test_register_returns_token_and_user(client):
    res = await client.post("/auth/register", json=REG)
    assert res.status_code == 201
    body = res.json()
    assert body["access_token"]
    assert body["user"]["email"] == "alice@test.com"
    assert "password" not in body["user"] and "password_hash" not in body["user"]


@pytest.mark.asyncio
async def test_register_duplicate_email_400(client):
    await client.post("/auth/register", json=REG)
    res = await client.post("/auth/register", json=REG)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_login_ok(client):
    await client.post("/auth/register", json=REG)
    res = await client.post(
        "/auth/login", json={"email": REG["email"], "password": REG["password"]}
    )
    assert res.status_code == 200
    assert res.json()["access_token"]


@pytest.mark.asyncio
async def test_login_wrong_password_401(client):
    await client.post("/auth/register", json=REG)
    res = await client.post(
        "/auth/login", json={"email": REG["email"], "password": "wrong"}
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_token(client):
    res = await client.get("/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_with_invalid_token_401(client):
    res = await client.get("/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_with_valid_token(client):
    reg = await client.post("/auth/register", json=REG)
    token = reg.json()["access_token"]
    res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == REG["email"]
