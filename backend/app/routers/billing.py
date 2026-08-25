"""Endpoint de webhook do Stripe (issue #45, ADR 0001)."""

import json
import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_db
from app.services.billing_service import handle_event

router = APIRouter(prefix="/billing", tags=["Billing"])
logger = logging.getLogger("norby.billing")
settings = get_settings()

# Evento do Stripe é pequeno (alguns KB). O teto existe porque esta rota é
# anônima e roda HMAC: sem ele, qualquer um faz o servidor assinar megabytes
# de lixo. É esta a proteção certa aqui — rate limit por IP não é, ver abaixo.
MAX_CORPO = 64 * 1024


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Rota ANÔNIMA: quem autentica é a assinatura do Stripe, não um token.

    Sem rate limit por IP, e isso é decisão, não esquecimento: atrás do proxy do
    Railway todos os IPs são o mesmo (ver "Rate limit atrás do proxy" no
    AGENTS.md), então um teto por IP aqui deixaria qualquer pessoa derrubar as
    entregas do Stripe — o bug que a Onda 2 inteira existiu para matar.
    """
    if not settings.stripe_webhook_secret:
        # Billing desligado (o segredo ainda não existe no Railway). Melhor
        # recusar alto do que aceitar qualquer corpo como se fosse do Stripe.
        raise HTTPException(status_code=503, detail="Billing não configurado")

    # Corpo CRU: a verificação assina os bytes originais. Receber um modelo
    # Pydantic aqui faria o FastAPI parsear e reserializar o JSON, mudando os
    # bytes e invalidando toda assinatura válida.
    # Content-Length primeiro: recusa sem nem ler o corpo quando o cliente
    # declara o tamanho. A segunda checagem cobre quem omite o header ou mente.
    declarado = request.headers.get("content-length")
    if declarado and declarado.isdigit() and int(declarado) > MAX_CORPO:
        raise HTTPException(status_code=413, detail="Corpo grande demais")

    corpo = await request.body()
    if len(corpo) > MAX_CORPO:
        raise HTTPException(status_code=413, detail="Corpo grande demais")

    try:
        evento = stripe.Webhook.construct_event(
            corpo, request.headers.get("stripe-signature", ""), settings.stripe_webhook_secret
        )
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Assinatura inválida")

    # O SDK para AQUI, no papel de verificador. O `construct_event` acima já
    # validou os bytes; reparseá-los devolve o MESMO conteúdo como dict puro,
    # sem nenhum StripeObject vazando para dentro da aplicação. Isso mantém o
    # service testável sem o Stripe e deixa a troca de gateway sendo um dos 4
    # pontos de acoplamento que o ADR nomeia, em vez de uma reescrita.
    await handle_event(json.loads(corpo), db)
    return {"received": True}
