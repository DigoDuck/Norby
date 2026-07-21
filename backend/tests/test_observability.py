import pytest

from app.main import app


def _assert_security_headers(response):
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["content-security-policy"] == "frame-ancestors 'none'"
    assert "max-age=" in response.headers["strict-transport-security"]


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
    _assert_security_headers(res)


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


@pytest.mark.asyncio
async def test_responses_carry_security_headers(client):
    res = await client.get("/health")
    assert res.status_code == 200
    _assert_security_headers(res)


@pytest.mark.asyncio
async def test_security_headers_survive_error_responses(client):
    # Uma rota inexistente também precisa manter a política global de headers.
    res = await client.get("/rota-que-nao-existe")
    assert res.status_code == 404
    _assert_security_headers(res)


@pytest.mark.asyncio
async def test_cors_preflight_carries_global_response_headers(client):
    res = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert res.headers.get("x-request-id")
    _assert_security_headers(res)
