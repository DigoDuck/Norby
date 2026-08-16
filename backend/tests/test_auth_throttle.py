import pytest

# Issue #22: atraso progressivo por conta (HMAC do email), independente do IP
# (atrás do proxy do Railway o IP é o mesmo pra todo mundo, ver AGENTS.md).
# Curva: falhas 1-3 livres; da 4a falha em diante, 2**(n-3) segundos desde a
# última falha, capado em 60s. Sucesso reseta o contador.


async def _fail_login(client, email, password="senha-errada"):
    return await client.post("/auth/login", json={"email": email, "password": password})


@pytest.mark.asyncio
async def test_fourth_attempt_is_throttled_with_retry_after(client):
    email = "vitima@test.com"
    for _ in range(3):
        res = await _fail_login(client, email)
        assert res.status_code == 401

    res = await _fail_login(client, email)
    assert res.status_code == 429
    assert "Retry-After" in res.headers
    assert int(res.headers["Retry-After"]) >= 1


@pytest.mark.asyncio
async def test_successful_login_resets_the_counter(client):
    email = "reset@test.com"
    password = "secret123"
    await client.post(
        "/auth/register",
        json={"name": "Reset", "email": email, "password": password, "accept_privacy": True},
    )

    # 2 falhas: fica na zona livre (o teto só passa a valer com 3 falhas
    # acumuladas), então o login correto que vem a seguir não é bloqueado.
    for _ in range(2):
        res = await _fail_login(client, email)
        assert res.status_code == 401

    ok = await client.post("/auth/login", json={"email": email, "password": password})
    assert ok.status_code == 200

    # Se o sucesso não tivesse resetado o contador (ficasse em 2), a SEGUNDA
    # falha daqui pra frente já chegaria a 3 acumuladas e seria bloqueada.
    # Com reset de verdade, as duas seguem livres (401, não 429).
    for _ in range(2):
        res = await _fail_login(client, email)
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_counter_increments_identically_for_unknown_email(client):
    # E-mail que nunca foi cadastrado precisa seguir a MESMA curva do e-mail
    # existente. Se não seguisse, o comportamento do rate limit vazaria se o
    # e-mail existe ou não (oráculo de enumeração).
    email = "nunca-existiu@test.com"
    for _ in range(3):
        res = await _fail_login(client, email)
        assert res.status_code == 401

    res = await _fail_login(client, email)
    assert res.status_code == 429
    assert "Retry-After" in res.headers


@pytest.mark.asyncio
async def test_different_emails_do_not_share_a_bucket(client):
    email_a = "a@test.com"
    email_b = "b@test.com"

    for _ in range(3):
        res = await _fail_login(client, email_a)
        assert res.status_code == 401

    blocked = await _fail_login(client, email_a)
    assert blocked.status_code == 429

    # `a` está bloqueada, mas `b` nunca falhou: o balde dela é outra chave
    # HMAC e tem que estar livre.
    res_b = await _fail_login(client, email_b)
    assert res_b.status_code == 401


@pytest.mark.asyncio
async def test_stale_rows_are_purged_on_write(client, db_session):
    from datetime import datetime, timedelta, timezone

    from app.models.sql_models import LoginThrottle
    from app.services.throttle_service import _key_hash

    stale_key = _key_hash("velho@test.com")
    stale = LoginThrottle(
        key_hash=stale_key,
        failure_count=5,
        last_failure_at=datetime.now(timezone.utc) - timedelta(hours=25),
    )
    db_session.add(stale)
    await db_session.commit()

    # Qualquer escrita no caminho do throttle deve varrer linhas com mais de
    # 24h, mesmo que a chave escrita agora seja outra (purge não é por chave).
    await _fail_login(client, "outro@test.com")

    from sqlalchemy import select

    row = (
        await db_session.execute(select(LoginThrottle).where(LoginThrottle.key_hash == stale_key))
    ).scalar_one_or_none()
    assert row is None


@pytest.mark.asyncio
async def test_register_duplicate_also_feeds_the_same_throttle(client):
    # O cadastro compartilha o balde do login (mesma chave HMAC do email):
    # tentativas repetidas de "email já cadastrado" também acionam a curva.
    reg = {
        "name": "Dup",
        "email": "dup@test.com",
        "password": "secret123",
        "accept_privacy": True,
    }
    first = await client.post("/auth/register", json=reg)
    assert first.status_code == 201

    for _ in range(3):
        res = await client.post("/auth/register", json=reg)
        assert res.status_code == 400

    blocked = await client.post("/auth/register", json=reg)
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
