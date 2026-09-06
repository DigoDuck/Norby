import uuid
from decimal import Decimal

import pytest

from google.genai import chats as genai_chats

import app.services.ai_service as ai
from app.limiter import limiter
from app.models.sql_models import User, Wallet


def _chat_que_registra(recebido: list):
    """Stub da saída de rede do chat. Guarda o histórico que chegou, que é o
    que este teste precisa inspecionar."""
    async def _responder(historico, _mensagem):
        recebido.extend(historico)
        return "resposta ok", 0
    return _responder


async def _novo_usuario(db_session) -> User:
    """User de verdade: a cota diária (FK de `ai_usage_daily`) precisa de um
    `user_id` que exista, e `uuid.UUID("user-1")` não é um UUID válido."""
    user = User(name="Al", email=f"al_{uuid.uuid4().hex[:8]}@t.com", password_hash="x")
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_chat_survives_malformed_history_message(db_session, monkeypatch):
    # Um doc antigo/malformado no Mongo (sem role/content) não pode derrubar o chat.
    user = User(name="Al", email=f"al_{uuid.uuid4().hex[:8]}@t.com", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    db_session.add(Wallet(user_id=user.id, name="Main", balance=Decimal("0")))
    await db_session.commit()

    # Não bate na API real do Gemini.
    recebido = []
    monkeypatch.setattr(ai, "_responder_chat", _chat_que_registra(recebido))

    history = [{"foo": "bar"}, {"role": "user", "content": "oi"}]  # 1ª é malformada
    resp = await ai.chat_with_ai(db_session, str(user.id), "olá", history)
    assert resp == "resposta ok"
    # A malformada foi pulada, e não virou uma Content vazia.
    assert len(recebido) == 1
    assert recebido[0].parts[0].text == "oi"


class _FakeInsights:
    async def find_one(self, *_a, **_k):
        return None

    async def insert_one(self, *_a, **_k):
        return None

    async def update_one(self, *_a, **_k):
        return None


@pytest.mark.asyncio
async def test_insight_score_is_deterministic_not_from_llm(db_session, monkeypatch):
    # O score vem do cálculo, não do texto do LLM (que aqui nem traz score).
    summary = {
        "month": "July 2026",
        "total_income": 1000.0,
        "total_expenses": 700.0,  # s=0.3 -> 90
        "balance": 300.0,
        "top_categories": [],
    }

    async def _fake_summary(_db, _uid):
        return summary

    monkeypatch.setattr(ai, "_get_user_financial_summary", _fake_summary)
    monkeypatch.setattr(ai, "ai_insights_collection", _FakeInsights())

    async def _resposta(_prompt):
        return '{"summary_text": "a|b|c", "suggested_action": "faça X"}', 0

    monkeypatch.setattr(ai, "_gerar_json", _resposta)

    user = await _novo_usuario(db_session)
    result = await ai.get_or_generate_insight(db_session, str(user.id))
    assert result["score"] == 90
    assert result["summary_text"] == "a|b|c"
    assert result["suggested_action"] == "faça X"


@pytest.mark.asyncio
async def test_insight_returns_score_when_llm_text_fails(db_session, monkeypatch):
    # Mesmo se o texto da IA vier quebrado, o score (determinístico) deve ser
    # retornado normalmente — só o texto degrada.
    summary = {
        "month": "July 2026",
        "total_income": 1000.0,
        "total_expenses": 700.0,  # s=0.3 -> 90
        "balance": 300.0,
        "top_categories": [],
    }

    async def _fake_summary(_db, _uid):
        return summary

    monkeypatch.setattr(ai, "_get_user_financial_summary", _fake_summary)
    monkeypatch.setattr(ai, "ai_insights_collection", _FakeInsights())

    async def _nao_e_json(_prompt):
        return "não é json", 0

    monkeypatch.setattr(ai, "_gerar_json", _nao_e_json)

    user = await _novo_usuario(db_session)
    result = await ai.get_or_generate_insight(db_session, str(user.id))
    assert result["score"] == 90
    assert result["summary_text"] == ""
    assert result.get("error")


@pytest.mark.asyncio
async def test_insight_returns_score_when_llm_call_raises(db_session, monkeypatch):
    # Erro de API/rede/quota do Gemini (não só parse) também deve degradar
    # com elegância e devolver o score determinístico já calculado.
    summary = {
        "month": "July 2026",
        "total_income": 1000.0,
        "total_expenses": 700.0,  # s=0.3 -> 90
        "balance": 300.0,
        "top_categories": [],
    }

    async def _fake_summary(_db, _uid):
        return summary

    monkeypatch.setattr(ai, "_get_user_financial_summary", _fake_summary)
    monkeypatch.setattr(ai, "ai_insights_collection", _FakeInsights())

    async def _boom(_prompt):
        raise RuntimeError("gemini down")

    monkeypatch.setattr(ai, "_gerar_json", _boom)

    user = await _novo_usuario(db_session)
    result = await ai.get_or_generate_insight(db_session, str(user.id))
    assert result["score"] == 90
    assert result["summary_text"] == ""
    assert result.get("error")


class _FakeInsightsCacheHit:
    # Cache com fingerprint que BATE com o summary atual → texto é reaproveitado.
    def __init__(self, fingerprint):
        self._fp = fingerprint

    async def find_one(self, *_a, **_k):
        return {
            "score": 5,  # score em cache está desatualizado (stale)
            "summary_text": "cached text",
            "suggested_action": "x",
            "data_fingerprint": self._fp,
        }

    async def update_one(self, *_a, **_k):
        raise AssertionError("não deve regenerar quando o fingerprint bate")


@pytest.mark.asyncio
async def test_insight_recomputes_score_on_cache_hit(db_session, monkeypatch):
    # O texto pode vir do cache mensal, mas o score é sempre recalculado.
    summary = {
        "month": "July 2026",
        "total_income": 1000.0,
        "total_expenses": 700.0,  # s=0.3 -> 90
        "balance": 300.0,
        "top_categories": [],
    }

    async def _fake_summary(_db, _uid):
        return summary

    monkeypatch.setattr(ai, "_get_user_financial_summary", _fake_summary)
    monkeypatch.setattr(
        ai, "ai_insights_collection", _FakeInsightsCacheHit(ai._summary_fingerprint(summary))
    )
    # Se reaproveitar o cache, o Gemini nem é chamado.
    async def _boom(_prompt):
        raise AssertionError("não deve chamar o Gemini quando o fingerprint bate")

    monkeypatch.setattr(ai, "_gerar_json", _boom)

    user = await _novo_usuario(db_session)
    result = await ai.get_or_generate_insight(db_session, str(user.id))
    assert result["score"] == 90
    assert result["summary_text"] == "cached text"


class _FakeInsightsStale:
    # Cache com fingerprint ANTIGO → dados mudaram → texto deve ser regenerado.
    def __init__(self):
        self.updated = False
        self.update = None

    async def find_one(self, *_a, **_k):
        return {
            "score": 5,
            "summary_text": "texto velho e errado",
            "suggested_action": "ação antiga",
            "data_fingerprint": "fingerprint-antigo",
        }

    async def update_one(self, _filter, update, **_k):
        self.updated = True
        self.update = update
        return None


@pytest.mark.asyncio
async def test_insight_regenerates_text_when_data_changes(db_session, monkeypatch):
    # Regressão do bug real: a Leitura da IA ficava congelada mesmo com os dados
    # do mês mudando. Com o fingerprint diferente, o texto tem que ser regenerado.
    summary = {
        "month": "July 2026",
        "total_income": 4050.0,
        "total_expenses": 230.0,  # s alto -> score 100
        "balance": 3820.0,
        "top_categories": [{"category": "Outros", "total": 100.0}],
    }

    async def _fake_summary(_db, _uid):
        return summary

    fake = _FakeInsightsStale()
    monkeypatch.setattr(ai, "_get_user_financial_summary", _fake_summary)
    monkeypatch.setattr(ai, "ai_insights_collection", fake)

    async def _resposta(_prompt):
        return '{"summary_text": "novo|texto|fresco", "suggested_action": "nova ação"}', 0

    monkeypatch.setattr(ai, "_gerar_json", _resposta)

    user = await _novo_usuario(db_session)
    result = await ai.get_or_generate_insight(db_session, str(user.id))
    assert result["score"] == 100
    assert result["summary_text"] == "novo|texto|fresco"  # regenerado, não o velho
    assert result["suggested_action"] == "nova ação"
    assert fake.updated is True  # cache foi sobrescrito (upsert)
    # score nunca vive no cache: o upsert deve REMOVER qualquer score persistido.
    assert "score" in fake.update.get("$unset", {})


@pytest.mark.asyncio
async def test_chat_rejects_oversized_message(make_auth_client):
    # Mensagem gigante nunca chega ao Gemini: barrada na validação do Pydantic.
    ac = await make_auth_client("Alice")
    res = await ac.post("/ai/chat", json={"message": "x" * 5000})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_chat_rejects_empty_message(make_auth_client):
    ac = await make_auth_client("Alice")
    res = await ac.post("/ai/chat", json={"message": ""})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_chat_rejects_non_uuid_session_id(make_auth_client):
    # session_id livre viraria chave arbitrária no Mongo, sem teto de tamanho.
    ac = await make_auth_client("Alice")
    res = await ac.post("/ai/chat", json={"message": "oi", "session_id": "a" * 500})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_ai_rate_limit_is_per_user_not_per_ip(make_auth_client, monkeypatch):
    # Atrás do proxy do Railway todos os usuários chegam com o mesmo IP. Se a
    # chave do limiter fosse o IP, o balde estourado por um usuário derrubaria
    # todos os outros. A chave tem que ser o usuário autenticado.
    import app.routers.ai as ai_router

    async def _fake_insight(_db, _uid, _month, _year):
        return {"score": 50, "summary_text": "", "suggested_action": None}

    monkeypatch.setattr(ai_router, "get_or_generate_insight", _fake_insight)

    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")

    # O cadastro acima acontece com o limiter desligado (fixture autouse).
    # Só agora ligamos, para medir apenas as chamadas ao /ai/insight.
    limiter.reset()
    limiter.enabled = True
    try:
        codes = [(await alice.get("/ai/insight")).status_code for _ in range(30)]
        assert codes == [200] * 30, codes[-5:]
        assert (await alice.get("/ai/insight")).status_code == 429

        # Bob vem do MESMO IP de teste que a Alice. Com chave por usuário,
        # o balde estourado dela não pode afetá-lo.
        assert (await bob.get("/ai/insight")).status_code == 200
    finally:
        limiter.enabled = False
        limiter.reset()


@pytest.mark.asyncio
async def test_both_gemini_calls_carry_an_output_ceiling(monkeypatch):
    """Nenhuma das duas chamadas limitava o tamanho da resposta, então uma
    chamada sozinha não tinha teto de custo.

    Independente do teto DIÁRIO em desenho no #21: aquele limita quanto a
    pessoa gasta por dia, este limita o quão ruim UMA chamada consegue ser.
    """
    from types import SimpleNamespace

    capturado = {}

    async def _fake_generate(*, model, contents, config):
        capturado["insight"] = config.max_output_tokens
        return SimpleNamespace(text='{"summary_text": "a", "suggested_action": "b"}')

    async def _fake_send(self, _mensagem, config=None):
        capturado["chat"] = config.max_output_tokens
        return SimpleNamespace(text="ok")

    # `client.aio.chats` é uma property que devolve objeto NOVO a cada acesso,
    # então stubar a instância pegaria uma cópia descartável. Stubando a classe,
    # o `chats.create` de verdade roda e ainda valida o histórico tipado.
    monkeypatch.setattr(ai.client.aio.models, "generate_content", _fake_generate)
    monkeypatch.setattr(genai_chats.AsyncChat, "send_message", _fake_send)

    assert (await ai._gerar_json("prompt"))[0] == '{"summary_text": "a", "suggested_action": "b"}'
    assert (await ai._responder_chat([], "oi"))[0] == "ok"

    assert capturado["insight"] == ai.MAX_TOKENS_INSIGHT > 0
    assert capturado["chat"] == ai.MAX_TOKENS_CHAT > 0


@pytest.mark.asyncio
async def test_an_empty_chat_answer_raises_instead_of_being_stored(monkeypatch):
    """O SDK antigo levantava quando a resposta vinha vazia ou bloqueada; este
    devolve None. Sem a guarda, o "" chegaria à rota, seria GRAVADO no
    histórico como mensagem da IA e viraria uma bolha vazia — em vez do 503
    claro que a rota já sabe dar."""
    from types import SimpleNamespace

    async def _vazia(self, _mensagem, config=None):
        return SimpleNamespace(text=None)

    monkeypatch.setattr(genai_chats.AsyncChat, "send_message", _vazia)

    with pytest.raises(ValueError):
        await ai._responder_chat([], "oi")
