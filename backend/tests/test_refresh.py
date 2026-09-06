import asyncio

import pytest

from app.config import get_settings

REG = {
    "name": "Bob",
    "email": "bob@test.com",
    "password": "secret123",
    "accept_privacy": True,
}

COOKIE = get_settings().refresh_cookie_name


async def _register(client):
    res = await client.post("/auth/register", json=REG)
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_register_and_login_return_refresh_token(client):
    body = await _register(client)
    assert body["refresh_token"]

    res = await client.post(
        "/auth/login", json={"email": REG["email"], "password": REG["password"]}
    )
    assert res.status_code == 200
    assert res.json()["refresh_token"]


@pytest.mark.asyncio
async def test_refresh_rotates_and_invalidates_old_token(client):
    body = await _register(client)
    old_refresh = body["refresh_token"]

    res = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert res.status_code == 200
    new = res.json()
    assert new["access_token"]
    assert new["refresh_token"] and new["refresh_token"] != old_refresh

    # O novo refresh continua válido.
    again = await client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]})
    assert again.status_code == 200

    # O refresh antigo foi rotacionado: usá-lo de novo deve falhar. O cookie
    # tem precedência sobre o corpo (#110), e o jar do httpx já guarda o
    # cookie mais recente; limpa antes para garantir que É o corpo antigo
    # quem chega no servidor.
    client.cookies.clear()
    reused = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert reused.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client):
    body = await _register(client)
    refresh = body["refresh_token"]

    res = await client.post("/auth/logout", json={"refresh_token": refresh})
    assert res.status_code == 204

    # Depois do logout o refresh não vale mais.
    after = await client.post("/auth/refresh", json={"refresh_token": refresh})
    assert after.status_code == 401


@pytest.mark.asyncio
async def test_logout_is_idempotent_for_unknown_token(client):
    res = await client.post("/auth/logout", json={"refresh_token": "inexistente"})
    assert res.status_code == 204


@pytest.mark.asyncio
async def test_logout_is_rate_limited(client):
    # O logout derruba TODAS as sessões quando recebe um token já rotacionado
    # (ver test_logout_with_rotated_token_revokes_successor), então precisa do
    # mesmo teto do /auth/refresh. Sem limite, quem tivesse um refresh antigo da
    # vítima poderia derrubar as sessões dela em loop, para sempre.
    # Token desconhecido serve: o que se mede aqui é o balde, não a revogação.
    from app.limiter import limiter

    # Teto atual: 120/min (issue #22). A fixture global desliga o limiter;
    # religamos só para este teste.
    limiter.reset()
    limiter.enabled = True
    try:
        for _ in range(120):
            res = await client.post("/auth/logout", json={"refresh_token": "nao-existe"})
            assert res.status_code == 204
        estourou = await client.post("/auth/logout", json={"refresh_token": "nao-existe"})
        assert estourou.status_code == 429
    finally:
        limiter.enabled = False
        limiter.reset()


@pytest.mark.asyncio
async def test_logout_bucket_is_keyed_by_the_refresh_token_not_ip(client):
    # Issue #22: logout derruba TODAS as sessões de quem é dono do token, então
    # a chave principal não pode ser o IP (atrás do proxy, o balde seria
    # compartilhado por todo mundo). Dois tokens diferentes não podem esgotar
    # o mesmo balde POR TOKEN.
    from httpx import AsyncClient, ASGITransport

    from app.limiter import limiter
    from app.main import app

    limiter.reset()
    limiter.enabled = True
    try:
        for _ in range(120):
            res = await client.post("/auth/logout", json={"refresh_token": "token-a"})
            assert res.status_code == 204
        estourou = await client.post("/auth/logout", json={"refresh_token": "token-a"})
        assert estourou.status_code == 429

        # Fix round 3: aqui havia um limiter.reset() antes da chamada com
        # "token-b", e ele zerava OS DOIS baldes empilhados — o teste passaria
        # igual se a chave fosse o IP, ou seja, não provava nada. Em vez de
        # resetar, trocamos de IP: o balde por IP nasce limpo e o balde por
        # token continua saturado, então os dois asserts abaixo separam as
        # duas chaves.
        de_outro_ip = ASGITransport(app=app, client=("10.0.0.2", 1234))
        async with AsyncClient(transport=de_outro_ip, base_url="http://test") as outro_ip:
            mesmo_token = await outro_ip.post(
                "/auth/logout", json={"refresh_token": "token-a"}
            )
            assert mesmo_token.status_code == 429  # IP novo não livra o token saturado

            outro_token = await outro_ip.post(
                "/auth/logout", json={"refresh_token": "token-b"}
            )
            assert outro_token.status_code == 204  # token diferente = balde diferente
    finally:
        limiter.enabled = False
        limiter.reset()


@pytest.mark.asyncio
async def test_logout_has_an_ip_wide_flood_ceiling(client):
    # Fix round 1 (issue #22 review): chavear só pelo token deixava o teto
    # sem efeito nenhum contra flood — um token aleatório novo em toda
    # chamada nunca esgota o PRÓPRIO balde. O teto por IP empilhado (chave
    # padrão do slowapi) estoura mesmo com um token diferente a cada chamada.
    import uuid as uuid_mod

    from app.limiter import limiter

    limiter.reset()
    limiter.enabled = True
    try:
        for _ in range(120):
            token = uuid_mod.uuid4().hex
            res = await client.post("/auth/logout", json={"refresh_token": token})
            assert res.status_code == 204
        estourou = await client.post(
            "/auth/logout", json={"refresh_token": uuid_mod.uuid4().hex}
        )
        assert estourou.status_code == 429
    finally:
        limiter.enabled = False
        limiter.reset()


@pytest.mark.asyncio
async def test_refresh_no_longer_throttles_at_20_per_minute(client):
    # Issue #22: 20/min era um teto de capacidade, não uma defesa — com token
    # de acesso de 15min, usuários ativos legítimos já batiam nele. Novo teto
    # é 600/min; 25 chamadas seguidas não podem estourar.
    from app.limiter import limiter

    limiter.reset()
    limiter.enabled = True
    try:
        for _ in range(25):
            res = await client.post("/auth/refresh", json={"refresh_token": "nao-existe"})
            assert res.status_code == 401
    finally:
        limiter.enabled = False
        limiter.reset()


@pytest.mark.asyncio
async def test_refresh_with_invalid_token_401(client):
    res = await client.post("/auth/refresh", json={"refresh_token": "nao-existe"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_concurrent_rotation_issues_only_one_successor(client):
    # Duas rotações simultâneas do MESMO refresh: só uma pode vencer.
    # Sem FOR UPDATE, as duas validam o token ainda não revogado e emitem
    # dois sucessores válidos — o token roubado mantém sessão paralela.
    body = await _register(client)
    old = body["refresh_token"]

    res_a, res_b = await asyncio.gather(
        client.post("/auth/refresh", json={"refresh_token": old}),
        client.post("/auth/refresh", json={"refresh_token": old}),
    )
    assert sorted([res_a.status_code, res_b.status_code]) == [200, 401]


@pytest.mark.asyncio
async def test_reusing_rotated_token_revokes_all_sessions(client):
    # Reuso de um token já rotacionado = sinal de roubo. Derruba tudo.
    body = await _register(client)
    r1 = body["refresh_token"]
    r2 = (await client.post("/auth/refresh", json={"refresh_token": r1})).json()[
        "refresh_token"
    ]

    # Cookie tem precedência sobre o corpo (#110); limpa o jar para garantir
    # que r1 (já rotacionado) chega pelo corpo, não pelo cookie mais recente.
    client.cookies.clear()
    assert (await client.post("/auth/refresh", json={"refresh_token": r1})).status_code == 401
    # O sucessor legítimo também morre: a sessão inteira foi invalidada.
    assert (await client.post("/auth/refresh", json={"refresh_token": r2})).status_code == 401


@pytest.mark.asyncio
async def test_logout_with_rotated_token_revokes_successor(client):
    # SEC-01: atacante rouba R0 e rotaciona para R1. A vítima desloga com R0.
    # O logout precisa tratar isso como reuso e derrubar R1 também, senão o
    # atacante mantém sessão viva por 7 dias depois do logout da vítima.
    body = await _register(client)
    r0 = body["refresh_token"]

    r1 = (await client.post("/auth/refresh", json={"refresh_token": r0})).json()[
        "refresh_token"
    ]
    assert r1

    res = await client.post("/auth/logout", json={"refresh_token": r0})
    assert res.status_code == 204

    # O sucessor do atacante tem que estar morto.
    after = await client.post("/auth/refresh", json={"refresh_token": r1})
    assert after.status_code == 401


@pytest.mark.asyncio
async def test_login_sets_an_httponly_refresh_cookie(client):
    await _register(client)
    res = await client.post("/auth/login", json={"email": REG["email"], "password": REG["password"]})
    assert res.status_code == 200
    set_cookie = res.headers["set-cookie"]
    assert f"{COOKIE}=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie
    assert "Path=/auth" in set_cookie
    # O cookie leva o MESMO token do corpo durante a transição (passo 1 de 3).
    assert res.json()["refresh_token"] in set_cookie


@pytest.mark.asyncio
async def test_refresh_works_from_the_cookie_alone(client):
    body = await _register(client)
    antigo = client.cookies.get(COOKIE)
    assert antigo == body["refresh_token"]

    res = await client.post("/auth/refresh")  # sem corpo: só o cookie
    assert res.status_code == 200, res.text
    assert res.json()["access_token"]
    # Rotacionou: o cookie novo é outro, e o antigo já não vale. O jar do
    # httpx reenviaria o cookie novo (que tem precedência sobre o corpo), por
    # isso ele é limpo antes de apresentar o token antigo pelo corpo.
    novo = client.cookies.get(COOKIE)
    assert novo and novo != antigo
    client.cookies.clear()
    reused = await client.post("/auth/refresh", json={"refresh_token": antigo})
    assert reused.status_code == 401


@pytest.mark.asyncio
async def test_logout_clears_the_cookie(client):
    await _register(client)
    res = await client.post("/auth/logout")  # sem corpo: só o cookie
    assert res.status_code == 204
    assert "Max-Age=0" in res.headers["set-cookie"]
    # Sem cookie e sem corpo não há o que renovar.
    assert (await client.post("/auth/refresh")).status_code == 401
