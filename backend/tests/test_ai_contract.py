import pytest

from app.main import app


@pytest.mark.asyncio
async def test_ai_routes_expose_response_models_in_openapi():
    spec = app.openapi()
    schemas = spec["components"]["schemas"]

    def resp_schema(path, method="get"):
        return spec["paths"][path][method]["responses"]["200"]["content"]["application/json"]["schema"]

    # /ai/insight → InsightResponse
    assert resp_schema("/ai/insight").get("$ref", "").endswith("/InsightResponse")
    assert "InsightResponse" in schemas

    # /ai/chat → ChatResponse
    assert resp_schema("/ai/chat", "post").get("$ref", "").endswith("/ChatResponse")
    assert "ChatResponse" in schemas

    # /ai/chat/sessions → list[ChatSessionSummary]
    sessions = resp_schema("/ai/chat/sessions")
    assert sessions.get("type") == "array"
    assert sessions["items"].get("$ref", "").endswith("/ChatSessionSummary")
    assert "ChatSessionSummary" in schemas


@pytest.mark.asyncio
async def test_ai_chat_documents_503_in_openapi():
    spec = app.openapi()
    assert "503" in spec["paths"]["/ai/chat"]["post"]["responses"]
