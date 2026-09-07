"""Leitura do próprio uso diário de IA (issue #25).

Contadores próprios, sem portão de plano: ler o que já foi gasto não gasta
nada. Quem escreve esses números é a cota do `ai_service` (ADR 0003).
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import get_settings
import app.services.ai_service as ai
from app.models.sql_models import AiUsageDaily, User


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


async def _usuario(ac, db_session) -> User:
    me = (await ac.get("/auth/me")).json()
    return (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()


@pytest.mark.asyncio
async def test_usage_starts_at_zero_and_reports_the_caps(make_auth_client):
    alice = await make_auth_client("Alice")

    res = await alice.get("/ai/usage")
    assert res.status_code == 200, res.text
    corpo = res.json()
    assert (corpo["tokens"], corpo["calls"]) == (0, 0)
    assert corpo["token_cap"] == ai.DAILY_TOKEN_CAP
    assert corpo["call_cap"] == ai.DAILY_CALL_CAP
    assert datetime.fromisoformat(corpo["resets_at"]) > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_usage_reflects_todays_row_and_ignores_yesterdays(make_auth_client, db_session):
    alice = await make_auth_client("Alice")
    user = await _usuario(alice, db_session)
    db_session.add(AiUsageDaily(user_id=user.id, day=ai.dia_da_cota(), tokens=2100, calls=3))
    db_session.add(AiUsageDaily(
        user_id=user.id, day=ai.dia_da_cota() - timedelta(days=1), tokens=99_000, calls=90,
    ))
    await db_session.commit()

    corpo = (await alice.get("/ai/usage")).json()
    assert (corpo["tokens"], corpo["calls"]) == (2100, 3)


@pytest.mark.asyncio
async def test_usage_is_readable_without_ai_access(make_auth_client, db_session, paywall_ligado):
    # Sem portão de plano de propósito: são os contadores da própria pessoa, e
    # a tela decide se mostra. 403 aqui obrigaria o frontend a tratar recusa
    # para ler um número que não custa nada.
    alice = await make_auth_client("Alice")
    user = await _usuario(alice, db_session)
    user.ai_trial_ends_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db_session.commit()

    # Prova que o portão está mesmo fechado neste setup (senão o 200 abaixo
    # não provaria nada: passaria igual se a fixture do paywall parasse de
    # funcionar em silêncio).
    assert (await alice.get("/ai/insight")).status_code == 403
    assert (await alice.get("/ai/usage")).status_code == 200
