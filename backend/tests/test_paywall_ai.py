"""Portão de IA do ADR 0002 (issue #87).

Só a GERAÇÃO é bloqueada. Ler conversa que a pessoa já teve continua aberto:
não custa token de Gemini (o custo já foi pago) e o export da LGPD devolve
exatamente esse conteúdo — bloquear a tela enquanto o export entrega o mesmo
dado seria incoerente.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models.sql_models import User


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


async def _fora_do_trial(ac, db_session) -> User:
    """Usuário free de verdade: cadastro dá 7 dias de trial, então empurramos
    a data para o passado."""
    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()
    user.ai_trial_ends_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_a_free_user_past_the_trial_cannot_generate_an_insight(
    make_auth_client, db_session, mongo, paywall_ligado
):
    alice = await make_auth_client("Alice")
    await _fora_do_trial(alice, db_session)

    res = await alice.get("/ai/insight")
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "AI_REQUIRES_PREMIUM"


@pytest.mark.asyncio
async def test_a_free_user_past_the_trial_cannot_chat(
    make_auth_client, db_session, mongo, paywall_ligado
):
    alice = await make_auth_client("Alice")
    await _fora_do_trial(alice, db_session)

    res = await alice.post("/ai/chat", json={"message": "e aí?"})
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "AI_REQUIRES_PREMIUM"


@pytest.mark.asyncio
async def test_a_free_user_still_reads_their_own_chat_history(
    make_auth_client, db_session, mongo, paywall_ligado
):
    # O ponto do ticket: o custo do Gemini já foi pago quando a conversa foi
    # gerada. Bloquear a leitura não economiza nada e contradiz o export da LGPD.
    import uuid as uuid_mod

    alice = await make_auth_client("Alice")
    user = await _fora_do_trial(alice, db_session)
    sessao = str(uuid_mod.uuid4())  # a rota de detalhe tipa o path como UUID
    await mongo["chat_history"].insert_one(
        {
            "user_id": str(user.id),
            "session_id": sessao,
            "messages": [{"role": "user", "content": "oi"}],
            "created_at": datetime.now(timezone.utc),
        }
    )

    lista = await alice.get("/ai/chat/sessions")
    assert lista.status_code == 200, lista.text
    # Presença da sessão, não contagem: o Mongo não é limpo entre testes, então
    # `== 1` seria frágil ao que outro teste tenha escrito.
    assert sessao in [s["session_id"] for s in lista.json()]

    detalhe = await alice.get(f"/ai/chat/sessions/{sessao}")
    assert detalhe.status_code == 200


@pytest.mark.asyncio
async def test_a_user_inside_the_trial_still_generates(
    make_auth_client, db_session, mongo, paywall_ligado
):
    # Cadastro concede 7 dias; não mexemos na data.
    alice = await make_auth_client("Alice")

    res = await alice.get("/ai/insight")
    assert res.status_code != 403


@pytest.mark.asyncio
async def test_a_premium_user_generates_even_with_the_trial_long_gone(
    make_auth_client, db_session, mongo, paywall_ligado
):
    alice = await make_auth_client("Alice")
    user = await _fora_do_trial(alice, db_session)
    user.premium_until = datetime.now(timezone.utc) + timedelta(days=30)
    await db_session.commit()

    res = await alice.get("/ai/insight")
    assert res.status_code != 403


@pytest.mark.asyncio
async def test_with_the_flag_off_a_free_user_still_reaches_the_ai(
    make_auth_client, db_session, mongo
):
    # Sem a fixture: estado de produção no merge deste ticket.
    alice = await make_auth_client("Alice")
    await _fora_do_trial(alice, db_session)

    res = await alice.get("/ai/insight")
    assert res.status_code != 403
