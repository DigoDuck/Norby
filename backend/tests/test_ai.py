import uuid
from decimal import Decimal

import pytest

import app.services.ai_service as ai
from app.models.sql_models import User, Wallet


class _FakeChat:
    def send_message(self, _message):
        class _Resp:
            text = "resposta ok"
        return _Resp()


@pytest.mark.asyncio
async def test_chat_survives_malformed_history_message(db_session, monkeypatch):
    # Um doc antigo/malformado no Mongo (sem role/content) não pode derrubar o chat.
    user = User(name="Al", email=f"al_{uuid.uuid4().hex[:8]}@t.com", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    db_session.add(Wallet(user_id=user.id, name="Main", balance=Decimal("0")))
    await db_session.commit()

    # Não bate na API real do Gemini.
    monkeypatch.setattr(ai.model, "start_chat", lambda history: _FakeChat())

    history = [{"foo": "bar"}, {"role": "user", "content": "oi"}]  # 1ª é malformada
    resp = await ai.chat_with_ai(db_session, str(user.id), "olá", history)
    assert resp == "resposta ok"


class _FakeInsights:
    async def find_one(self, *_a, **_k):
        return None

    async def insert_one(self, *_a, **_k):
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

    class _Resp:
        text = '{"summary_text": "a|b|c", "suggested_action": "faça X"}'

    monkeypatch.setattr(ai.model, "generate_content", lambda _p: _Resp())

    result = await ai.get_or_generate_insight(db_session, "user-1", 7, 2026)
    assert result["score"] == 90
    assert result["summary_text"] == "a|b|c"
    assert result["suggested_action"] == "faça X"
