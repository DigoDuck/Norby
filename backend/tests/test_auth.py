import pytest

REG = {
    "name": "Alice",
    "email": "alice@test.com",
    "password": "secret123",
    "accept_privacy": True,
}


@pytest.mark.asyncio
async def test_register_returns_token_and_user(client):
    res = await client.post("/auth/register", json=REG)
    assert res.status_code == 201
    body = res.json()
    assert body["access_token"]
    assert body["user"]["email"] == "alice@test.com"
    assert "password" not in body["user"] and "password_hash" not in body["user"]


@pytest.mark.asyncio
@pytest.mark.parametrize("senha", ["123", "curta1", "semnumero", "12345678"])
async def test_register_weak_password_422(client, senha):
    # Senha precisa ter >=8 chars, ao menos uma letra e um número.
    # accept_privacy vai preenchido de propósito: sem ele o 422 viria do
    # consentimento e o teste deixaria de exercitar a regra da senha.
    res = await client.post(
        "/auth/register",
        json={
            "name": "Weak",
            "email": "weak@test.com",
            "password": senha,
            "accept_privacy": True,
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_strong_password_ok(client):
    res = await client.post(
        "/auth/register",
        json={
            "name": "Strong",
            "email": "strong@test.com",
            "password": "senha1234",
            "accept_privacy": True,
        },
    )
    assert res.status_code == 201


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


@pytest.mark.asyncio
async def test_login_runs_bcrypt_even_for_unknown_email(client, monkeypatch):
    # Sem o hash dummy, e-mail inexistente retorna sem passar por bcrypt: a
    # diferença de tempo (~200ms) revela quais e-mails estão cadastrados.
    import app.routers.auth as auth_router

    calls = []
    real = auth_router.verify_password

    def spy(plain, hashed):
        calls.append(hashed)
        return real(plain, hashed)

    monkeypatch.setattr(auth_router, "verify_password", spy)

    res = await client.post(
        "/auth/login", json={"email": "ninguem@test.com", "password": "secret123"}
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Credenciais inválidas"
    assert calls, "bcrypt precisa rodar também quando o e-mail não existe"


@pytest.mark.asyncio
async def test_register_requires_privacy_consent(client):
    # Consentimento validado só no frontend não é consentimento: sem o campo,
    # o cadastro não pode ser aceito.
    res = await client.post(
        "/auth/register",
        json={"name": "Carol", "email": "carol@test.com", "password": "secret123"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_rejects_declined_consent(client):
    res = await client.post(
        "/auth/register",
        json={
            "name": "Carol",
            "email": "carol@test.com",
            "password": "secret123",
            "accept_privacy": False,
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_persists_consent_timestamp(client, db_session):
    from sqlalchemy import select
    from app.models.sql_models import User

    res = await client.post(
        "/auth/register",
        json={
            "name": "Carol",
            "email": "carol@test.com",
            "password": "secret123",
            "accept_privacy": True,
        },
    )
    assert res.status_code == 201, res.text

    user = (
        await db_session.execute(select(User).where(User.email == "carol@test.com"))
    ).scalar_one()
    assert user.privacy_accepted_at is not None
