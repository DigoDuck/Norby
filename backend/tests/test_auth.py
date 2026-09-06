import uuid
from datetime import datetime, timedelta, timezone

import jwt  # PyJWT. Os dois testes abaixo são de caracterização: foram escritos e
# passaram com o python-jose antes da troca, e têm de continuar passando aqui.
import pytest

from app.config import get_settings

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
async def test_expired_access_token_is_rejected(client):
    s = get_settings()
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        s.secret_key,
        algorithm=s.algorithm,
    )
    res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_token_signed_with_another_key_is_rejected(client):
    s = get_settings()
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        "outra-chave-que-nao-e-a-do-servidor",
        algorithm=s.algorithm,
    )
    res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
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
    real = auth_router.verify_and_upgrade

    def spy(plain, hashed):
        calls.append(hashed)
        return real(plain, hashed)

    monkeypatch.setattr(auth_router, "verify_and_upgrade", spy)

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


@pytest.mark.asyncio
async def test_register_grants_a_seven_day_ai_trial(client, db_session):
    # ADR 0001: o trial é conceito do Norby, não Subscription do Stripe — senão
    # todo cadastro criaria Customer e Subscription lá, inclusive de quem nunca
    # paga. Assertivo no banco pelo mesmo motivo do teste de consentimento
    # acima: o campo não é exposto no UserResponse, e expor agora pré-decidiria
    # a issue #20, que é quem escolhe como o frontend descobre o plano.
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select
    from app.models.sql_models import User

    antes = datetime.now(timezone.utc)
    res = await client.post(
        "/auth/register",
        json={
            "name": "Dani",
            "email": "dani@test.com",
            "password": "secret123",
            "accept_privacy": True,
        },
    )
    assert res.status_code == 201, res.text

    user = (
        await db_session.execute(select(User).where(User.email == "dani@test.com"))
    ).scalar_one()
    # Janela em vez de igualdade exata: o cadastro roda bcrypt no meio.
    assert antes + timedelta(days=7) <= user.ai_trial_ends_at <= datetime.now(timezone.utc) + timedelta(days=7)
    # E o trial não pode vazar para o teto de carteiras.
    assert user.premium_until is None


@pytest.mark.asyncio
async def test_register_rejects_password_over_72_bytes(client):
    # bcrypt trunca em 72 bytes. Sem o teto, o sufixo seria ignorado e a senha
    # longa se comportaria como uma senha de 72 bytes disfarçada.
    res = await client.post("/auth/register", json={
        "name": "Dave", "email": "dave@test.com",
        "password": "A" * 72 + "1", "accept_privacy": True,
    })
    assert res.status_code == 422
    assert any("72 bytes" in error["msg"] for error in res.json()["detail"])


@pytest.mark.asyncio
async def test_register_counts_password_bytes_not_characters(client):
    # 36 caracteres acentuados mais A1 ocupam 74 bytes e ultrapassam o limite
    # real do bcrypt apesar de passarem no max_length=128 do Pydantic.
    res = await client.post("/auth/register", json={
        "name": "Erin", "email": "erin@test.com",
        "password": "á" * 36 + "A1", "accept_privacy": True,
    })
    assert res.status_code == 422
    assert any("72 bytes" in error["msg"] for error in res.json()["detail"])


@pytest.mark.asyncio
async def test_new_passwords_use_bcrypt_sha256(client, db_session):
    from sqlalchemy import select
    from app.models.sql_models import User

    await client.post("/auth/register", json={
        "name": "Fay", "email": "fay@test.com",
        "password": "secret123", "accept_privacy": True,
    })
    user = (await db_session.execute(
        select(User).where(User.email == "fay@test.com")
    )).scalar_one()
    assert user.password_hash.startswith("$bcrypt-sha256$")


def test_verify_and_upgrade_rehashes_legacy_bcrypt():
    import bcrypt

    from app.services.auth_service import verify_and_upgrade

    # bcrypt direto, sem passlib (#102). Continua gerando o MESMO formato
    # legado que existe no banco, que é o ponto do teste.
    legacy = bcrypt.hashpw(b"secret123", bcrypt.gensalt(12)).decode("ascii")
    ok, upgraded = verify_and_upgrade("secret123", legacy)
    assert ok is True
    assert upgraded is not None and upgraded.startswith("$bcrypt-sha256$")

    ok, upgraded = verify_and_upgrade("senha-errada", legacy)
    assert ok is False
    assert upgraded is None


@pytest.mark.asyncio
async def test_login_persists_upgraded_legacy_bcrypt_hash(client, db_session):
    import bcrypt

    from app.models.sql_models import User

    user = User(
        name="Gus",
        email="gus@test.com",
        password_hash=bcrypt.hashpw(b"secret123", bcrypt.gensalt(12)).decode("ascii"),
    )
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        "/auth/login", json={"email": "gus@test.com", "password": "secret123"}
    )
    assert response.status_code == 200

    await db_session.refresh(user)
    assert user.password_hash.startswith("$bcrypt-sha256$")


@pytest.mark.asyncio
async def test_delete_account_rate_limit_is_per_user(client, mongo):
    from app.limiter import limiter

    async def register(name, email):
        response = await client.post("/auth/register", json={
            "name": name, "email": email,
            "password": "secret123", "accept_privacy": True,
        })
        assert response.status_code == 201, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    attacker = await register("Mal", "mal@test.com")
    victim = await register("Vic", "vic@test.com")

    # A fixture global desliga o limiter. Religamos só depois do cadastro para
    # medir exclusivamente o balde do DELETE /auth/me.
    limiter.reset()
    limiter.enabled = True
    try:
        for _ in range(3):
            response = await client.request(
                "DELETE", "/auth/me", headers=attacker,
                json={"confirm": True, "password": "errada"},
            )
            assert response.status_code == 401

        response = await client.request(
            "DELETE", "/auth/me", headers=victim,
            json={"confirm": True, "password": "secret123"},
        )
        assert response.status_code == 204
    finally:
        limiter.enabled = False
        limiter.reset()

@pytest.mark.asyncio
async def test_update_me_ignores_explicit_null(make_auth_client):
    ac = await make_auth_client("Alice")
    antes = (await ac.get("/auth/me")).json()

    res = await ac.put("/auth/me", json={"name": None})
    assert res.status_code == 200
    assert res.json()["name"] == antes["name"]


@pytest.mark.asyncio
async def test_update_me_rejects_long_name(make_auth_client):
    # UserRegister limita o nome a 100 chars, UserUpdate não limitava nada:
    # o valor batia no String(100) da coluna e virava 500.
    ac = await make_auth_client("Alice")
    res = await ac.put("/auth/me", json={"name": "x" * 300})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_update_me_rejects_empty_name(make_auth_client):
    ac = await make_auth_client("Alice")
    res = await ac.put("/auth/me", json={"name": ""})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_update_me_changes_name(make_auth_client):
    # Caminho feliz: a rota não tinha nenhum teste antes desta fase.
    ac = await make_auth_client("Alice")
    res = await ac.put("/auth/me", json={"name": "Nome Novo"})
    assert res.status_code == 200
    assert res.json()["name"] == "Nome Novo"


@pytest.mark.asyncio
async def test_update_me_enforces_the_same_floor_as_register(make_auth_client):
    # O cadastro exige 2 caracteres. Se o update aceitasse 1, ele viraria uma
    # porta dos fundos para um nome que o cadastro recusaria.
    ac = await make_auth_client("Alice")
    res = await ac.put("/auth/me", json={"name": "A"})
    assert res.status_code == 422

    ok = await ac.put("/auth/me", json={"name": "Al"})
    assert ok.status_code == 200

