"""Cota diária de IA (issue #21, ADR 0003).

Dois tetos por usuário e por dia da cota: tokens reais lidos do
`usage_metadata` e número de chamadas. Valem para todo mundo que passa pelo
portão de plano, trial incluído, e não dependem de `paywall_enabled`.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
import pytest_asyncio
from sqlalchemy import select

import app.services.ai_service as ai
from app.config import get_settings
from app.models.sql_models import AiUsageDaily, Transaction, TransactionType, User, Wallet

INSIGHT = '{"summary_text": "a|b|c", "suggested_action": "faça X"}'


@pytest_asyncio.fixture
async def mongo(monkeypatch):
    """Sombra o `mongo` do conftest só neste arquivo. O original rebinda as
    coleções do `account_service`; `ai_service.py` e `routers/ai.py` importam
    a coleção do `database` direto no módulo, e este é o primeiro arquivo a
    bater de verdade em `/ai/chat` e `/ai/insight` mais de uma vez na mesma
    sessão. Sem rebindar as duas também, os testes caem no cliente de import,
    preso ao primeiro event loop que o tocou: RuntimeError "Event loop is
    closed" do 2º teste em diante. Mesmo truque de `monkeypatch.setattr` que
    test_ai.py e test_ai_history.py já usam para essas duas coleções, com a
    coleção real do fixture no lugar de um fake."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from app import database
    import app.services.account_service as acc
    import app.routers.ai as ai_router

    client = AsyncIOMotorClient(database.settings.mongodb_url)
    db = client["norby_db"]
    insights = db["ai_insights"]
    history = db["chat_history"]

    monkeypatch.setattr(acc, "ai_insights_collection", insights)
    monkeypatch.setattr(acc, "chat_history_collection", history)
    monkeypatch.setattr(ai, "ai_insights_collection", insights)
    monkeypatch.setattr(ai_router, "chat_history_collection", history)
    try:
        yield {"ai_insights": insights, "chat_history": history}
    finally:
        client.close()


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


@pytest.fixture
def gemini_stubado(monkeypatch):
    """Nenhum teste aqui bate na API real. Os stubs devolvem (texto, tokens),
    o mesmo contrato das funções de rede."""

    async def _chat(_historico, _mensagem):
        return "resposta ok", 700

    async def _insight(_prompt):
        return INSIGHT, 300

    monkeypatch.setattr(ai, "_responder_chat", _chat)
    monkeypatch.setattr(ai, "_gerar_json", _insight)


async def _usuario(ac, db_session) -> User:
    me = (await ac.get("/auth/me")).json()
    return (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()


async def _gastar(db_session, user: User, *, tokens=0, calls=0, day: date | None = None):
    # merge, não add: a linha do dia pode já existir se o teste gerou antes.
    await db_session.merge(
        AiUsageDaily(user_id=user.id, day=day or ai.dia_da_cota(), tokens=tokens, calls=calls)
    )
    await db_session.commit()


async def _uso_de_hoje(db_session, user: User) -> AiUsageDaily:
    # user.id ANTES do expire_all: expirar e só depois ler um atributo do
    # próprio `user` pediria um refresh síncrono fora de contexto async
    # (MissingGreenlet) — a linha do dia é o que precisa vir fresco.
    user_id = user.id
    db_session.expire_all()
    return (
        await db_session.execute(
            select(AiUsageDaily).where(
                AiUsageDaily.user_id == user_id, AiUsageDaily.day == ai.dia_da_cota()
            )
        )
    ).scalar_one()


@pytest.mark.asyncio
async def test_chat_past_the_daily_token_cap_is_refused_with_the_code(
    make_auth_client, db_session, mongo, gemini_stubado
):
    # Sem a fixture do paywall: flag desligado, o estado da produção. A cota
    # protege a produção a partir do merge, não a partir da virada.
    alice = await make_auth_client("Alice")
    await _gastar(db_session, await _usuario(alice, db_session), tokens=ai.DAILY_TOKEN_CAP)

    res = await alice.post("/ai/chat", json={"message": "e aí?"})
    assert res.status_code == 403, res.text
    detail = res.json()["detail"]
    assert detail["code"] == "AI_DAILY_CAP_REACHED"
    assert detail["message"] == ai.DAILY_CAP_MESSAGE
    assert datetime.fromisoformat(detail["resets_at"]) > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_the_call_ceiling_refuses_on_its_own(
    make_auth_client, db_session, mongo, gemini_stubado
):
    # No tier gratuito o limite do projeto é em requisições (RPD 500): o teto
    # de chamadas é o que protege esse dia compartilhado, tokens à parte.
    alice = await make_auth_client("Alice")
    await _gastar(db_session, await _usuario(alice, db_session), tokens=0, calls=ai.DAILY_CALL_CAP)

    res = await alice.post("/ai/chat", json={"message": "e aí?"})
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "AI_DAILY_CAP_REACHED"


@pytest.mark.asyncio
async def test_each_call_debits_the_real_token_count_and_one_call(
    make_auth_client, db_session, mongo, gemini_stubado
):
    alice = await make_auth_client("Alice")
    user = await _usuario(alice, db_session)

    for _ in range(2):
        assert (await alice.post("/ai/chat", json={"message": "oi"})).status_code == 200

    uso = await _uso_de_hoje(db_session, user)
    assert (uso.tokens, uso.calls) == (1400, 2)


@pytest.mark.asyncio
async def test_a_cached_insight_is_served_even_past_the_cap(
    make_auth_client, db_session, mongo, gemini_stubado
):
    # Cache por fingerprint: não chama o Gemini, não debita, não é barrado.
    alice = await make_auth_client("Alice")
    user = await _usuario(alice, db_session)
    primeira = await alice.get("/ai/insight")
    assert primeira.status_code == 200, primeira.text
    assert primeira.json()["summary_text"] == "a|b|c"

    await _gastar(db_session, user, tokens=ai.DAILY_TOKEN_CAP)

    segunda = await alice.get("/ai/insight")
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()["summary_text"] == "a|b|c"
    assert not segunda.json().get("error")

    # "não debita" fica afirmado, não presumido: a 2ª leitura (cache) não soma
    # nada aos (DAILY_TOKEN_CAP, 0) que o `_gastar` acima gravou.
    uso = await _uso_de_hoje(db_session, user)
    assert (uso.tokens, uso.calls) == (ai.DAILY_TOKEN_CAP, 0)


@pytest.mark.asyncio
async def test_an_uncached_insight_past_the_cap_degrades_with_the_cap_message(
    make_auth_client, db_session, mongo, gemini_stubado
):
    # O score é determinístico e continua real; só o texto não vem. 200, não
    # 403: o widget do dashboard já sabe mostrar esse estado.
    alice = await make_auth_client("Alice")
    user = await _usuario(alice, db_session)
    # compute_financial_score devolve None sem nenhuma transação no mês (conta
    # nova de verdade não tem nenhuma). Uma renda garante um score numérico de
    # verdade, que é exatamente o que a asserção abaixo verifica.
    wallet = Wallet(user_id=user.id, name="Main", balance=Decimal("1000"))
    db_session.add(wallet)
    await db_session.flush()
    db_session.add(Transaction(
        user_id=user.id, wallet_id=wallet.id, type=TransactionType.INCOME,
        amount=Decimal("1000"), category="Salário", date=date.today(),
    ))
    await db_session.commit()
    await _gastar(db_session, user, tokens=ai.DAILY_TOKEN_CAP)

    res = await alice.get("/ai/insight")
    assert res.status_code == 200, res.text
    corpo = res.json()
    assert corpo["error"] == ai.DAILY_CAP_MESSAGE
    assert corpo["summary_text"] == ""
    assert isinstance(corpo["score"], (int, float))


@pytest.mark.asyncio
async def test_yesterdays_usage_does_not_count_today(
    make_auth_client, db_session, mongo, gemini_stubado
):
    alice = await make_auth_client("Alice")
    ontem = ai.dia_da_cota() - timedelta(days=1)
    await _gastar(
        db_session, await _usuario(alice, db_session),
        tokens=ai.DAILY_TOKEN_CAP, calls=ai.DAILY_CALL_CAP, day=ontem,
    )

    assert (await alice.post("/ai/chat", json={"message": "oi"})).status_code == 200


@pytest.mark.asyncio
async def test_a_trial_user_is_capped_too(
    make_auth_client, db_session, mongo, gemini_stubado, paywall_ligado
):
    # Cadastro concede 7 dias de trial de IA sem cartão: a conta mais barata
    # de criar por script. A cota vale para ela como para o premium, e o
    # código é o da cota, não o AI_REQUIRES_PREMIUM.
    alice = await make_auth_client("Alice")
    await _gastar(db_session, await _usuario(alice, db_session), tokens=ai.DAILY_TOKEN_CAP)

    res = await alice.post("/ai/chat", json={"message": "oi"})
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["code"] == "AI_DAILY_CAP_REACHED"


def test_tokens_usados_reads_the_total_and_treats_missing_thoughts_as_zero():
    com_total = SimpleNamespace(usage_metadata=SimpleNamespace(
        prompt_token_count=7, candidates_token_count=1,
        thoughts_token_count=None, total_token_count=8,
    ))
    sem_total = SimpleNamespace(usage_metadata=SimpleNamespace(
        prompt_token_count=7, candidates_token_count=1,
        thoughts_token_count=None, total_token_count=None,
    ))
    assert ai._tokens_usados(com_total) == 8
    assert ai._tokens_usados(sem_total) == 8
    # Stub sem usage_metadata: zero tokens; o teto de chamadas segura o dia.
    assert ai._tokens_usados(SimpleNamespace(text="stub")) == 0


def test_the_quota_day_turns_at_pacific_midnight():
    # 08:00 UTC é a meia-noite em UTC-8, o instante em que o Google zera o RPD.
    antes = datetime(2026, 9, 6, 7, 59, tzinfo=timezone.utc)
    depois = datetime(2026, 9, 6, 8, 0, tzinfo=timezone.utc)
    assert ai.dia_da_cota(antes) == date(2026, 9, 5)
    assert ai.dia_da_cota(depois) == date(2026, 9, 6)
    assert ai.cota_zera_em(depois) == datetime(2026, 9, 7, 8, 0, tzinfo=timezone.utc)
