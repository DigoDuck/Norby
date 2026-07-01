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
