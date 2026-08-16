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


# --- Fix round 1 (review de issue #22) --------------------------------------


@pytest.mark.asyncio
async def test_register_duplicate_email_different_case_400(client):
    # CRITICAL do fix round 1: o check de duplicidade era sensível a caixa,
    # permitindo criar uma conta-sombra ("Joao@..." ao lado de "joao@...").
    await client.post("/auth/register", json={
        "name": "Joao", "email": "joao@test.com",
        "password": "secret123", "accept_privacy": True,
    })
    res = await client.post("/auth/register", json={
        "name": "Joao Sombra", "email": "Joao@test.com",
        "password": "outrasenha1", "accept_privacy": True,
    })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_login_is_case_insensitive_on_email(client):
    await client.post("/auth/register", json={
        "name": "Joao", "email": "joao@test.com",
        "password": "secret123", "accept_privacy": True,
    })
    res = await client.post(
        "/auth/login", json={"email": "JOAO@test.com", "password": "secret123"}
    )
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_shadow_account_cannot_reset_victims_throttle(client):
    # Fecha a rota de ataque descrita no fix round 1: sem a conta-sombra (bloqueada
    # pelo teste de duplicidade insensível a caixa acima), não existe login
    # válido com "Vitima2@..." que possa resetar o balde de "vitima2@...".
    victim_email = "vitima2@test.com"
    await client.post("/auth/register", json={
        "name": "Vitima", "email": victim_email,
        "password": "secret123", "accept_privacy": True,
    })

    shadow = await client.post("/auth/register", json={
        "name": "Atacante", "email": "Vitima2@test.com",
        "password": "outrasenha1", "accept_privacy": True,
    })
    assert shadow.status_code == 400

    # A tentativa de cadastro-sombra rejeitada já é 1 falha no MESMO balde
    # (cadastro e login compartilham a chave HMAC do email) — só faltam 2
    # falhas livres pra chegar nas 3 acumuladas que travam a próxima.
    for _ in range(2):
        res = await _fail_login(client, victim_email)
        assert res.status_code == 401
    blocked = await _fail_login(client, victim_email)
    assert blocked.status_code == 429


@pytest.mark.asyncio
async def test_after_waiting_the_retry_after_window_the_attempt_goes_through(client, db_session):
    # Prova a premissa inteira da decisão: atraso, não bloqueio permanente.
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.models.sql_models import LoginThrottle
    from app.services.throttle_service import _key_hash

    email = "espera@test.com"
    for _ in range(3):
        res = await _fail_login(client, email)
        assert res.status_code == 401

    blocked = await _fail_login(client, email)
    assert blocked.status_code == 429
    retry_after = int(blocked.headers["Retry-After"])

    # Simula a espera empurrando last_failure_at pra trás, sem dormir de
    # verdade no teste.
    row = (
        await db_session.execute(select(LoginThrottle).where(LoginThrottle.key_hash == _key_hash(email)))
    ).scalar_one()
    row.last_failure_at = datetime.now(timezone.utc) - timedelta(seconds=retry_after + 1)
    await db_session.commit()

    res = await _fail_login(client, email)
    assert res.status_code == 401  # não é mais 429: a espera passou


@pytest.mark.asyncio
async def test_wait_is_capped_at_60_seconds(client, db_session):
    from datetime import datetime, timezone

    from app.models.sql_models import LoginThrottle
    from app.services.throttle_service import _key_hash

    email = "capado@test.com"
    db_session.add(LoginThrottle(
        key_hash=_key_hash(email), failure_count=20, last_failure_at=datetime.now(timezone.utc),
    ))
    await db_session.commit()

    res = await _fail_login(client, email)
    assert res.status_code == 429
    assert int(res.headers["Retry-After"]) <= 60


@pytest.mark.asyncio
async def test_repeated_429_does_not_extend_the_wait(client):
    email = "sempre-bloqueado@test.com"
    for _ in range(3):
        res = await _fail_login(client, email)
        assert res.status_code == 401

    first_block = await _fail_login(client, email)
    assert first_block.status_code == 429
    first_retry = int(first_block.headers["Retry-After"])

    # Bater de novo enquanto bloqueado não pode empurrar a espera pra frente:
    # check_throttle não grava nada quando já está bloqueado (só quem chega a
    # verificar credencial, e falha, escreve — e isso nunca acontece aqui).
    second_block = await _fail_login(client, email)
    assert second_block.status_code == 429
    second_retry = int(second_block.headers["Retry-After"])
    assert second_retry <= first_retry


@pytest.mark.asyncio
async def test_concurrent_first_failures_do_not_500_or_lose_count(db_session):
    # IMPORTANT do fix round 1: o read-modify-write em Python (SELECT, depois
    # INSERT/UPDATE) perdia incremento sob concorrência e, quando as duas eram
    # a 1a falha da chave, as duas caíam no INSERT — a segunda violava o
    # índice único como IntegrityError não tratado (o middleware global vira
    # isso em 500). Testado direto no service, com duas sessões/conexões
    # independentes: passando por /auth/login (bcrypt via asyncio.to_thread no
    # meio) o timing não reproduzia a corrida de forma confiável neste
    # ambiente; chamando record_failure direto, reproduz sempre — foi assim
    # que o bug foi confirmado manualmente antes desta correção (ver relatório).
    import asyncio

    from sqlalchemy import select

    from app.models.sql_models import LoginThrottle
    from app.services.throttle_service import _key_hash, record_failure
    from tests.conftest import TestSessionLocal

    email = "concorrente@test.com"

    async def _fail():
        async with TestSessionLocal() as session:
            await record_failure(email, session)

    # Sem o upsert atômico, isto estourava IntegrityError na maior parte das
    # execuções (13/20 numa verificação manual). asyncio.gather deixa a
    # exceção não tratada estourar o teste, o que já reproduz o "vira 500".
    await asyncio.gather(*[_fail() for _ in range(5)])

    row = (
        await db_session.execute(select(LoginThrottle).where(LoginThrottle.key_hash == _key_hash(email)))
    ).scalar_one()
    assert row.failure_count == 5
