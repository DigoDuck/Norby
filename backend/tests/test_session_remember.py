"""Sessão lembrada x não lembrada (issue #175).

Sem "manter conectado": cookie de SESSÃO (sem Max-Age) e teto absoluto de 24h
a partir do login, que a rotação herda e nunca estica. O cookie de sessão
sozinho não basta — Chrome, Edge e Firefox restauram cookies de sessão ao
reabrir —, então quem fecha a janela é o teto no servidor.

Com "manter conectado": 7 dias que renovam a cada uso, como antes, mas agora
com teto absoluto de 90 dias. Antes, uma sessão em uso nunca expirava.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update

from app.config import get_settings
from app.models.sql_models import RefreshToken
from app.services.auth_service import (
    ROTATION_REUSE_GRACE,
    SESSAO_NAO_LEMBRADA,
    TETO_SESSAO_LEMBRADA,
    _hash_token,
)

COOKIE = get_settings().refresh_cookie_name
EMAIL = "sessao@test.com"
SENHA = "secret123"


async def _cadastra(client):
    res = await client.post(
        "/auth/register",
        json={"name": "Sessao", "email": EMAIL, "password": SENHA, "accept_privacy": True},
    )
    assert res.status_code == 201, res.text
    client.cookies.clear()


async def _login(client, **extra):
    res = await client.post("/auth/login", json={"email": EMAIL, "password": SENHA, **extra})
    assert res.status_code == 200, res.text
    return res


def _cookie_de_refresh(res) -> str:
    cabecalhos = [c for c in res.headers.get_list("set-cookie") if c.startswith(f"{COOKIE}=")]
    assert len(cabecalhos) == 1, cabecalhos
    return cabecalhos[0]


def _max_age(cabecalho: str) -> int | None:
    for parte in cabecalho.split(";"):
        chave, _, valor = parte.strip().partition("=")
        if chave.lower() == "max-age":
            return int(valor)
    return None


async def _registro(db_session, raw) -> RefreshToken:
    db_session.expire_all()
    return await db_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == _hash_token(raw))
    )


def _perto(a: datetime, b: datetime, folga=timedelta(minutes=1)) -> bool:
    return abs(a - b) <= folga


@pytest.mark.asyncio
async def test_login_without_remember_is_a_browser_session_capped_at_24h(client, db_session):
    await _cadastra(client)
    res = await _login(client)

    assert _max_age(_cookie_de_refresh(res)) is None, "sem Max-Age: cookie de sessão"
    registro = await _registro(db_session, client.cookies.get(COOKIE))
    agora = datetime.now(timezone.utc)
    assert registro.remember is False
    assert _perto(registro.session_expires_at, agora + SESSAO_NAO_LEMBRADA)
    assert registro.expires_at == registro.session_expires_at


@pytest.mark.asyncio
async def test_rotating_a_short_session_never_extends_it(client, db_session):
    # Se a rotação renovasse os 24h, uma aba aberta num computador
    # compartilhado manteria a sessão viva para sempre — o mesmo buraco de
    # antes, com outro número.
    await _cadastra(client)
    await _login(client)
    # Guardado já: a próxima leitura expira os objetos da sessão.
    teto = (await _registro(db_session, client.cookies.get(COOKIE))).session_expires_at

    res = await client.post("/auth/refresh")
    assert res.status_code == 200
    assert _max_age(_cookie_de_refresh(res)) is None
    sucessor = await _registro(db_session, client.cookies.get(COOKIE))
    assert sucessor.remember is False
    assert sucessor.session_expires_at == teto
    assert sucessor.expires_at == teto


@pytest.mark.asyncio
async def test_login_with_remember_slides_7_days_under_a_90_day_cap(client, db_session):
    await _cadastra(client)
    res = await _login(client, remember=True)

    max_age = _max_age(_cookie_de_refresh(res))
    assert max_age is not None and abs(max_age - 7 * 86400) <= 60
    registro = await _registro(db_session, client.cookies.get(COOKIE))
    agora = datetime.now(timezone.utc)
    assert registro.remember is True
    assert _perto(registro.session_expires_at, agora + TETO_SESSAO_LEMBRADA)
    assert _perto(registro.expires_at, agora + timedelta(days=7))


@pytest.mark.asyncio
async def test_a_remembered_session_stops_at_its_cap_however_often_it_is_used(client, db_session):
    # Antes do #175, os 7 dias renovavam a cada uso sem teto nenhum: um
    # aparelho perdido e em uso ficava logado para sempre.
    await _cadastra(client)
    await _login(client, remember=True)
    teto_proximo = datetime.now(timezone.utc) + timedelta(hours=1)
    await db_session.execute(update(RefreshToken).values(session_expires_at=teto_proximo))
    await db_session.commit()

    res = await client.post("/auth/refresh")
    assert res.status_code == 200
    sucessor = await _registro(db_session, client.cookies.get(COOKIE))
    assert sucessor.expires_at == teto_proximo, "a renovação de 7 dias não passa do teto"
    max_age = _max_age(_cookie_de_refresh(res))
    assert max_age is not None and max_age <= 3600


@pytest.mark.asyncio
async def test_the_reuse_grace_does_not_revive_a_session_past_its_cap(client, db_session):
    # A janela de 30s (#130) devolve um sucessor novo a quem reapresenta o
    # antecessor. Ela não olhava validade nenhuma: sem esta checagem, um
    # token rotacionado segundos antes do teto ganharia vida além dele.
    await _cadastra(client)
    await _login(client)
    r0 = client.cookies.get(COOKIE)
    assert (await client.post("/auth/refresh")).status_code == 200

    passado = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.execute(
        update(RefreshToken).values(session_expires_at=passado, expires_at=passado)
    )
    await db_session.commit()
    revogado_em = (await _registro(db_session, r0)).revoked_at
    assert datetime.now(timezone.utc) - revogado_em <= ROTATION_REUSE_GRACE

    client.cookies.clear()
    client.cookies.set(COOKIE, r0)
    assert (await client.post("/auth/refresh")).status_code == 401


@pytest.mark.asyncio
async def test_a_new_account_starts_with_a_short_session(client, db_session):
    # O cadastro não tem a caixa; o default seguro vale para ele também.
    res = await client.post(
        "/auth/register",
        json={"name": "Nova", "email": "nova@test.com", "password": SENHA, "accept_privacy": True},
    )
    assert res.status_code == 201
    assert _max_age(_cookie_de_refresh(res)) is None
    registro = await _registro(db_session, client.cookies.get(COOKIE))
    assert registro.remember is False
