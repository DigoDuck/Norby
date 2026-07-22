import asyncio

import pytest

REG = {
    "name": "Bob",
    "email": "bob@test.com",
    "password": "secret123",
    "accept_privacy": True,
}


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

    # O refresh antigo foi rotacionado: usá-lo de novo deve falhar.
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

    assert (await client.post("/auth/refresh", json={"refresh_token": r1})).status_code == 401
    # O sucessor legítimo também morre: a sessão inteira foi invalidada.
    assert (await client.post("/auth/refresh", json={"refresh_token": r2})).status_code == 401
