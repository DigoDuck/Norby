"""Teto global de tamanho de corpo (issue #152, scan F1/F8).

Sem isto, um POST anônimo chunked (sem `Content-Length`) de alguns GB derruba
o worker único por OOM antes de qualquer rota/`@limiter.limit` rodar — nem
`/auth/login` nem o webhook do Stripe tinham qualquer defesa contra isso.
"""

import io

import pytest
from PIL import Image

from app.body_size_limit import BODY_SIZE_LIMIT
from app.config import get_settings


async def _pedacos(total_bytes: int, tamanho_pedaco: int = 64 * 1024):
    """Gera bytes aos poucos: um GERADOR ASSÍNCRONO (o `AsyncClient` exige
    stream async) é o que faz o ASGITransport do httpx mandar a requisição em
    chunks, SEM `Content-Length` — o caminho que o middleware precisa cobrir
    mesmo quando o cliente não declara (ou mente sobre) o tamanho.
    """
    enviado = 0
    while enviado < total_bytes:
        pedaco = min(tamanho_pedaco, total_bytes - enviado)
        yield b"x" * pedaco
        enviado += pedaco


def _bmp_de_uns(alvo_bytes: int) -> bytes:
    """BMP (sem compressão) de tamanho previsível: perfeito pra mirar um
    número de bytes exato, ao contrário de PNG/WEBP (compressão varia com o
    conteúdo). BMP está na lista de formatos aceitos por `processar_foto`.
    """
    lado = int((alvo_bytes / 3) ** 0.5)
    buf = io.BytesIO()
    Image.new("RGB", (lado, lado), (10, 20, 30)).save(buf, format="BMP")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_a_chunked_body_without_content_length_over_the_cap_is_refused(client):
    resposta = await client.post(
        "/auth/login", content=_pedacos(BODY_SIZE_LIMIT + 1024)
    )
    assert resposta.status_code == 413
    assert resposta.json()["detail"] == "Corpo grande demais"


@pytest.mark.asyncio
async def test_the_webhook_gets_the_same_cap_even_with_a_secret_configured(
    client, monkeypatch
):
    # Sem segredo configurado a rota devolveria 503 antes mesmo de olhar pro
    # corpo — o que provaria pouco. Configurar garante que é o TETO GLOBAL
    # (defesa em profundidade, antes do MAX_CORPO próprio do billing.py) quem
    # corta, não a ausência de segredo.
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "segredo_de_teste")
    resposta = await client.post(
        "/billing/webhook",
        content=_pedacos(BODY_SIZE_LIMIT + 1024),
        headers={"Stripe-Signature": "t=1,v1=lixo"},
    )
    assert resposta.status_code == 413
    assert resposta.json()["detail"] == "Corpo grande demais"


@pytest.mark.asyncio
async def test_a_normal_body_still_goes_through(client):
    # Corpo pequeno e normal não pode virar 413. 401 (credenciais erradas) é
    # prova de que a requisição chegou inteira na rota.
    resposta = await client.post(
        "/auth/login", json={"email": "nao@existe.com", "password": "errada123"}
    )
    assert resposta.status_code == 401


@pytest.mark.asyncio
async def test_the_photo_upload_still_accepts_one_point_five_mb(make_auth_client):
    # PUT /auth/me/photo é isento do teto global (tem o próprio, de 2 MB, ver
    # body_size_limit.py) — 1.5 MB estoura o teto GLOBAL de 1 MiB mas cabe
    # folgado no teto da rota. Sem a isenção este teste ficaria vermelho.
    alice = await make_auth_client("Alice")
    dados = _bmp_de_uns(int(1.5 * 1024 * 1024))
    assert BODY_SIZE_LIMIT < len(dados) < 2 * 1024 * 1024

    resposta = await alice.put(
        "/auth/me/photo", content=dados, headers={"Content-Type": "image/bmp"}
    )
    assert resposta.status_code == 200, resposta.text
