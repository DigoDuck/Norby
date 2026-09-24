import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from app.config import get_settings
from app.models.sql_models import RefreshToken
from app.services.auth_service import ROTATION_REUSE_GRACE

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
async def test_the_refresh_token_never_travels_in_the_body(client):
    body = await _register(client)
    assert "refresh_token" not in body
    res = await client.post("/auth/refresh")
    assert res.status_code == 200
    assert "refresh_token" not in res.json()


@pytest.mark.asyncio
async def test_refresh_rotates_and_invalidates_old_token(client, db_session):
    await _register(client)
    old_refresh = client.cookies.get(COOKIE)

    res = await client.post("/auth/refresh")
    assert res.status_code == 200
    new = res.json()
    assert new["access_token"]
    novo_refresh = client.cookies.get(COOKIE)
    assert novo_refresh and novo_refresh != old_refresh

    # O novo refresh continua válido.
    again = await client.post("/auth/refresh")
    assert again.status_code == 200

    # #130: dentro dos 30s de ROTATION_REUSE_GRACE, reapresentar o antigo
    # ganharia um sucessor novo em vez de falhar (resposta perdida). Este
    # teste quer o antigo comportamento — token rotacionado É inválido —,
    # então envelhece a revogação para além da janela antes de reapresentar.
    await db_session.execute(
        update(RefreshToken)
        .where(RefreshToken.revoked.is_(True))
        .values(revoked_at=datetime.now(timezone.utc) - ROTATION_REUSE_GRACE - timedelta(seconds=1))
    )
    await db_session.commit()

    # O refresh antigo foi rotacionado: usá-lo de novo deve falhar. O jar do
    # httpx já guarda o cookie mais recente; apresenta o antigo explicitamente
    # para garantir que É ele quem chega no servidor. O cookie que o servidor
    # setou vive em Path=/auth e o que setamos aqui explicitamente vai pra "/"
    # — limpar antes deixa claro qual token o servidor efetivamente recebe.
    client.cookies.clear()
    client.cookies.set(COOKIE, old_refresh)
    reused = await client.post("/auth/refresh")
    assert reused.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client):
    await _register(client)
    refresh = client.cookies.get(COOKIE)

    res = await client.post("/auth/logout")
    assert res.status_code == 204

    # Depois do logout o refresh não vale mais.
    client.cookies.clear()
    client.cookies.set(COOKIE, refresh)
    after = await client.post("/auth/refresh")
    assert after.status_code == 401


@pytest.mark.asyncio
async def test_logout_is_idempotent_for_unknown_token(client):
    client.cookies.clear()
    client.cookies.set(COOKIE, "inexistente")
    res = await client.post("/auth/logout")
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
            # Logout limpa o cookie a cada chamada; reapresenta o mesmo token
            # antes de cada uma, senão a segunda já cairia em 401 por falta
            # de cookie em vez de medir o balde.
            client.cookies.clear()
            client.cookies.set(COOKIE, "nao-existe")
            res = await client.post("/auth/logout")
            assert res.status_code == 204
        client.cookies.clear()
        client.cookies.set(COOKIE, "nao-existe")
        estourou = await client.post("/auth/logout")
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
            # Logout limpa o cookie a cada chamada; reapresenta o mesmo token
            # antes de cada uma para não cair em 401 por falta de cookie.
            client.cookies.clear()
            client.cookies.set(COOKIE, "token-a")
            res = await client.post("/auth/logout")
            assert res.status_code == 204
        client.cookies.clear()
        client.cookies.set(COOKIE, "token-a")
        estourou = await client.post("/auth/logout")
        assert estourou.status_code == 429

        # Fix round 3: aqui havia um limiter.reset() antes da chamada com
        # "token-b", e ele zerava OS DOIS baldes empilhados — o teste passaria
        # igual se a chave fosse o IP, ou seja, não provava nada. Em vez de
        # resetar, trocamos de IP: o balde por IP nasce limpo e o balde por
        # token continua saturado, então os dois asserts abaixo separam as
        # duas chaves.
        de_outro_ip = ASGITransport(app=app, client=("10.0.0.2", 1234))
        async with AsyncClient(transport=de_outro_ip, base_url="http://test") as outro_ip:
            outro_ip.cookies.clear()
            outro_ip.cookies.set(COOKIE, "token-a")
            mesmo_token = await outro_ip.post("/auth/logout")
            assert mesmo_token.status_code == 429  # IP novo não livra o token saturado

            outro_ip.cookies.clear()
            outro_ip.cookies.set(COOKIE, "token-b")
            outro_token = await outro_ip.post("/auth/logout")
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
            client.cookies.clear()
            client.cookies.set(COOKIE, uuid_mod.uuid4().hex)
            res = await client.post("/auth/logout")
            assert res.status_code == 204
        client.cookies.clear()
        client.cookies.set(COOKIE, uuid_mod.uuid4().hex)
        estourou = await client.post("/auth/logout")
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
    client.cookies.clear()
    client.cookies.set(COOKIE, "nao-existe")
    try:
        for _ in range(25):
            res = await client.post("/auth/refresh")
            assert res.status_code == 401
    finally:
        limiter.enabled = False
        limiter.reset()


@pytest.mark.asyncio
async def test_refresh_with_invalid_token_401(client):
    client.cookies.clear()
    client.cookies.set(COOKIE, "nao-existe")
    res = await client.post("/auth/refresh")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_concurrent_rotations_both_succeed_within_the_grace(client):
    # Duas abas restaurando ao mesmo tempo apresentam o MESMO cookie. O FOR
    # UPDATE serializa: a segunda vê o token já rotacionado há milissegundos,
    # dentro da janela, e ganha um sucessor próprio em vez de derrubar tudo.
    await _register(client)
    res_a, res_b = await asyncio.gather(
        client.post("/auth/refresh"),
        client.post("/auth/refresh"),
    )
    assert [res_a.status_code, res_b.status_code] == [200, 200]
    assert res_a.json()["access_token"] and res_b.json()["access_token"]


@pytest.mark.asyncio
async def test_reusing_a_just_rotated_token_within_the_grace_keeps_the_session(client):
    # Resposta perdida: o servidor rotacionou r0 -> r1, o navegador ficou com r0.
    await _register(client)
    r0 = client.cookies.get(COOKIE)
    await client.post("/auth/refresh")
    r1 = client.cookies.get(COOKIE)

    client.cookies.clear()
    client.cookies.set(COOKIE, r0)
    res = await client.post("/auth/refresh")
    assert res.status_code == 200
    # res.cookies, não client.cookies: o jar do httpx guarda o cookie setado
    # à mão acima (domain="") e o que o servidor acabou de emitir (domain do
    # host efetivo) como duas entradas distintas com o mesmo nome — CookieConflict
    # no client.cookies.get(). res.cookies só tem o que ESTA resposta setou.
    r2 = res.cookies.get(COOKIE)
    assert r2 and r2 not in (r0, r1)

    # Nada foi derrubado: r1 e r2 continuam válidos.
    for token in (r1, r2):
        client.cookies.clear()
        client.cookies.set(COOKIE, token)
        assert (await client.post("/auth/refresh")).status_code == 200


@pytest.mark.asyncio
async def test_reusing_rotated_token_revokes_all_sessions(client, db_session):
    # Reuso de um token rotacionado FORA da janela = sinal de roubo. Derruba tudo.
    await _register(client)
    r1 = client.cookies.get(COOKIE)
    await client.post("/auth/refresh")
    r2 = client.cookies.get(COOKIE)

    # Envelhece a revogação para além da janela.
    await db_session.execute(
        update(RefreshToken)
        .where(RefreshToken.revoked.is_(True))
        .values(revoked_at=datetime.now(timezone.utc) - ROTATION_REUSE_GRACE - timedelta(seconds=1))
    )
    await db_session.commit()

    client.cookies.clear()
    client.cookies.set(COOKIE, r1)
    assert (await client.post("/auth/refresh")).status_code == 401
    client.cookies.clear()
    client.cookies.set(COOKIE, r2)
    assert (await client.post("/auth/refresh")).status_code == 401


@pytest.mark.asyncio
async def test_logout_with_rotated_token_revokes_successor(client):
    # SEC-01: atacante rouba R0 e rotaciona para R1. A vítima desloga com R0.
    # O logout precisa tratar isso como reuso e derrubar R1 também, senão o
    # atacante mantém sessão viva por 7 dias depois do logout da vítima.
    await _register(client)
    r0 = client.cookies.get(COOKIE)

    await client.post("/auth/refresh")
    r1 = client.cookies.get(COOKIE)
    assert r1 and r1 != r0

    # A vítima desloga apresentando R0, o token roubado e já rotacionado.
    client.cookies.clear()
    client.cookies.set(COOKIE, r0)
    res = await client.post("/auth/logout")
    assert res.status_code == 204

    # O sucessor do atacante tem que estar morto.
    client.cookies.clear()
    client.cookies.set(COOKIE, r1)
    after = await client.post("/auth/refresh")
    assert after.status_code == 401


@pytest.mark.asyncio
async def test_logout_cascade_kills_a_predecessor_still_inside_the_rotation_grace(client):
    # Revisão do #156: a mesma query antiga da cascata (`revoked IS false`)
    # também é usada aqui (SEC-01). r0 chega ao logout já revogado por uma
    # rotação normal segundos antes — a cascata não precisa "tocá-lo" de
    # novo, mas o revoked_at daquela rotação normal sobrevive intacto, e
    # continua dentro da janela de graça. Reapresentar r0 depois da cascata
    # ainda caía no ramo "dentro da janela" de rotate_refresh_token, que
    # devolve um par novo — a cascata que prometia derrubar tudo não era
    # terminal para o próprio token que a disparou.
    await _register(client)
    r0 = client.cookies.get(COOKIE)
    await client.post("/auth/refresh")  # rotaciona r0 -> r1; r0.revoked_at fica recente

    client.cookies.clear()
    client.cookies.set(COOKIE, r0)
    cascata = await client.post("/auth/logout")  # r0 já revogado -> dispara a cascata de roubo
    assert cascata.status_code == 204

    client.cookies.clear()
    client.cookies.set(COOKIE, r0)
    ressuscitado = await client.post("/auth/refresh")
    assert ressuscitado.status_code == 401


@pytest.mark.asyncio
async def test_login_sets_an_httponly_refresh_cookie(client):
    await _register(client)
    res = await client.post("/auth/login", json={"email": REG["email"], "password": REG["password"]})
    assert res.status_code == 200
    assert "refresh_token" not in res.json()
    set_cookie = res.headers["set-cookie"]
    assert f"{COOKIE}=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=strict" in set_cookie
    assert "Path=/auth" in set_cookie


@pytest.mark.asyncio
async def test_refresh_works_from_the_cookie_alone(client, db_session):
    await _register(client)
    antigo = client.cookies.get(COOKIE)

    res = await client.post("/auth/refresh")  # sem corpo: só o cookie
    assert res.status_code == 200, res.text
    assert res.json()["access_token"]
    # Rotacionou: o cookie novo é outro, e o antigo já não vale.
    novo = client.cookies.get(COOKIE)
    assert novo and novo != antigo

    # #130: fora dos 30s de ROTATION_REUSE_GRACE, reapresentar o antigo
    # continua inválido (dentro da janela ganharia um sucessor novo).
    await db_session.execute(
        update(RefreshToken)
        .where(RefreshToken.revoked.is_(True))
        .values(revoked_at=datetime.now(timezone.utc) - ROTATION_REUSE_GRACE - timedelta(seconds=1))
    )
    await db_session.commit()

    client.cookies.clear()
    client.cookies.set(COOKIE, antigo)
    reused = await client.post("/auth/refresh")
    assert reused.status_code == 401


@pytest.mark.asyncio
async def test_logout_clears_the_cookie(client):
    await _register(client)
    res = await client.post("/auth/logout")  # sem corpo: só o cookie
    assert res.status_code == 204
    assert "Max-Age=0" in res.headers["set-cookie"]
    # Um delete_cookie que esquecesse o path deixaria um cookie vivo no
    # navegador (Path=/ != Path=/auth) e a checagem de revogação no banco
    # acima passaria do mesmo jeito, escondendo o vazamento.
    assert "Path=/auth" in res.headers["set-cookie"]
    # Sem cookie e sem corpo não há o que renovar.
    assert (await client.post("/auth/refresh")).status_code == 401


@pytest.mark.asyncio
async def test_the_cookie_alone_does_not_authenticate_a_route(client):
    # O cookie tem Path=/auth, então o navegador manda ele pra /auth/me também
    # (e para qualquer outra rota sob /auth). Só /auth/refresh e /auth/logout
    # podem lê-lo; todo o resto autentica exclusivamente pelo bearer token.
    await _register(client)  # o client agora carrega o cookie
    res = await client.get("/auth/me")  # sem header Authorization
    assert res.status_code == 401


async def _espera_alguem_travado(timeout=5.0, obrigatorio=True):
    """Bloqueia até outra conexão estar parada esperando lock no Postgres.

    É o que torna determinísticos os testes de concorrência abaixo: sem isso,
    eles dependeriam de `sleep` e do escalonador para acertar a ordem. Conexão
    NOVA a cada consulta: o Postgres fotografa o pg_stat_activity uma vez por
    transação, e reler dentro da mesma devolveria sempre a mesma foto.
    """
    from sqlalchemy import text

    from tests.conftest import test_engine

    prazo = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < prazo:
        async with test_engine.connect() as conn:
            travados = await conn.scalar(
                text("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'")
            )
        if travados:
            return
        await asyncio.sleep(0.02)
    if obrigatorio:
        raise AssertionError("nenhuma conexão chegou a esperar lock")


async def _conclui(tarefa):
    """Espera a tarefa concorrente; se o teste falhar antes, cancela-a, para
    a sessão dela não ficar presa num lock e travar o teardown do schema."""
    try:
        return await asyncio.wait_for(tarefa, timeout=10)
    finally:
        tarefa.cancel()


@pytest.mark.asyncio
async def test_two_concurrent_cascades_for_one_user_do_not_deadlock(client, db_session):
    # #165: duas cascatas paralelas do mesmo usuário (dois tokens velhos
    # reapresentados juntos, ou logout velho + refresh velho) travavam em
    # deadlock. Cada uma segurava o PRÓPRIO token com FOR UPDATE e o UPDATE
    # da cascata precisava da linha que a outra segurava; o Postgres matava
    # uma delas e a requisição virava 500.
    #
    # Interleaving forçado: `outra` faz o que uma cascata concorrente faz
    # (trava o usuário, depois o próprio token s0) e fica parada; só então a
    # rotação de r0 entra. A cascata de `outra` roda depois que a rotação já
    # está esperando lock, que é o instante do deadlock no código antigo.
    from sqlalchemy import select

    from app.models.sql_models import User
    from app.services.auth_service import (
        _hash_token, revoke_all_refresh_tokens, rotate_refresh_token,
    )
    from tests.conftest import TestSessionLocal

    await _register(client)
    r0 = client.cookies.get(COOKIE)
    await client.post("/auth/refresh")
    s0 = (await client.post("/auth/login", json={"email": REG["email"], "password": REG["password"]})).cookies.get(COOKIE)
    assert s0
    client.cookies.clear()
    client.cookies.set(COOKIE, s0)
    await client.post("/auth/refresh")  # s0 também rotacionado

    # Os dois tokens velhos saem da janela de graça: reapresentar = cascata.
    await db_session.execute(
        update(RefreshToken)
        .where(RefreshToken.revoked.is_(True))
        .values(revoked_at=datetime.now(timezone.utc) - ROTATION_REUSE_GRACE - timedelta(seconds=1))
    )
    await db_session.commit()
    user_id = await db_session.scalar(
        select(RefreshToken.user_id).where(RefreshToken.token_hash == _hash_token(s0))
    )

    async with TestSessionLocal() as outra, TestSessionLocal() as sess_rotacao:
        await outra.execute(select(User.id).where(User.id == user_id).with_for_update())
        await outra.execute(
            select(RefreshToken).where(RefreshToken.token_hash == _hash_token(s0)).with_for_update()
        )

        rotacao = asyncio.create_task(rotate_refresh_token(r0, sess_rotacao))
        try:
            await _espera_alguem_travado()
            await revoke_all_refresh_tokens(user_id, outra)
            await outra.commit()
        finally:
            resultado = await _conclui(rotacao)
        assert resultado is None

    db_session.expire_all()
    vivos = (
        await db_session.execute(
            select(RefreshToken).where(
                RefreshToken.revoked.is_(False) | RefreshToken.revoked_at.is_not(None)
            )
        )
    ).scalars().all()
    assert vivos == []


@pytest.mark.asyncio
async def test_a_cascade_catches_a_successor_committed_while_it_waited(client, db_session):
    # #165, corrida de READ COMMITTED: um sucessor que outra transação
    # commitava enquanto a cascata estava em andamento ficava fora do
    # snapshot do UPDATE e sobrevivia a ela. `outra` faz o papel de uma
    # rotação legítima em voo: trava o usuário e insere o sucessor, ainda sem
    # commit. A cascata (logout com token velho) precisa esperar por ela e
    # então enxergar o sucessor.
    from sqlalchemy import select

    from app.models.sql_models import User
    from app.services.auth_service import _hash_token, _new_refresh, revoke_refresh_token
    from tests.conftest import TestSessionLocal

    await _register(client)
    r0 = client.cookies.get(COOKIE)
    await client.post("/auth/refresh")
    await db_session.execute(
        update(RefreshToken)
        .where(RefreshToken.revoked.is_(True))
        .values(revoked_at=datetime.now(timezone.utc) - ROTATION_REUSE_GRACE - timedelta(seconds=1))
    )
    await db_session.commit()
    user_id = await db_session.scalar(
        select(RefreshToken.user_id).where(RefreshToken.token_hash == _hash_token(r0))
    )

    async with TestSessionLocal() as outra, TestSessionLocal() as sess_logout:
        await outra.execute(select(User.id).where(User.id == user_id).with_for_update())
        sucessor = _new_refresh(str(user_id), outra)
        await outra.flush()

        cascata = asyncio.create_task(revoke_refresh_token(r0, sess_logout))
        try:
            # Não obrigatório: no código sem a fila no usuário a cascata nem
            # espera — termina sem enxergar o sucessor, e quem reprova é a
            # asserção final, que é o defeito de verdade.
            await _espera_alguem_travado(timeout=1.0, obrigatorio=False)
            await outra.commit()
        finally:
            await _conclui(cascata)

    db_session.expire_all()
    registro = await db_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == _hash_token(sucessor))
    )
    assert registro.revoked is True and registro.revoked_at is None
