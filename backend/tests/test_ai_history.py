import types

import pytest

from app.main import app
from app.dependencies import get_current_user
import app.routers.ai as ai_router


class _FakeChatHistory:
    """Coleção falsa que honra o filtro user_id/session_id do find_one."""

    def __init__(self, docs):
        self._docs = docs

    async def find_one(self, query, *_a, **_k):
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                return d
        return None


@pytest.mark.asyncio
async def test_get_session_returns_messages(client, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: types.SimpleNamespace(id="user-A")
    docs = [{
        "user_id": "user-A",
        "session_id": "s1",
        "messages": [
            {"role": "user", "content": "oi"},
            {"role": "assistant", "content": "olá"},
            {"role": "user"},  # malformada (sem content) → ignorada
        ],
    }]
    monkeypatch.setattr(ai_router, "chat_history_collection", _FakeChatHistory(docs))

    res = await client.get("/ai/chat/sessions/s1")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["session_id"] == "s1"
    assert body["messages"] == [
        {"role": "user", "content": "oi"},
        {"role": "assistant", "content": "olá"},
    ]
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_get_session_404_for_other_user(client, monkeypatch):
    # user-B não pode ver a sessão de user-A.
    app.dependency_overrides[get_current_user] = lambda: types.SimpleNamespace(id="user-B")
    docs = [{"user_id": "user-A", "session_id": "s1", "messages": []}]
    monkeypatch.setattr(ai_router, "chat_history_collection", _FakeChatHistory(docs))

    res = await client.get("/ai/chat/sessions/s1")
    assert res.status_code == 404
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_session_detail_route_in_openapi(client):
    spec = (await client.get("/openapi.json")).json()
    path = spec["paths"]["/ai/chat/sessions/{session_id}"]["get"]
    ref = path["responses"]["200"]["content"]["application/json"]["schema"].get("$ref", "")
    assert ref.endswith("/ChatSessionDetail")
    assert "ChatSessionDetail" in spec["components"]["schemas"]
