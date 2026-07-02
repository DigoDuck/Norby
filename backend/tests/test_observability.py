import pytest

from app.main import app


# Rota de teste que estoura, para exercitar o handler global de exceção.
@app.get("/_boom_test", include_in_schema=False)
async def _boom_test():
    raise RuntimeError("boom")


@pytest.mark.asyncio
async def test_unhandled_exception_returns_generic_500_with_request_id(client):
    res = await client.get("/_boom_test", headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 500
    assert res.json() == {"detail": "Erro interno do servidor"}
    assert res.headers.get("x-request-id")
    # CORS preservado no 500 (senão o navegador mascara como erro de CORS).
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


@pytest.mark.asyncio
async def test_response_carries_request_id_header(client):
    # Toda resposta deve trazer um X-Request-ID para correlacionar logs.
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.headers.get("x-request-id")


@pytest.mark.asyncio
async def test_request_id_is_echoed_when_provided(client):
    # Se o cliente mandar um X-Request-ID, ele é preservado na resposta.
    res = await client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert res.headers.get("x-request-id") == "abc-123"
