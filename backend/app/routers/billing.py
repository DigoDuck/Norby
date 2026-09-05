"""Rotas de billing: webhook (#45) e Checkout/Portal (#46), do ADR 0001."""

import json
import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_current_user, get_db
from app.limiter import limiter, user_key
from app.models.sql_models import User
from app.services.billing_service import (
    CheckoutNotOurs,
    CheckoutNotPaid,
    GatewayError,
    confirm_checkout,
    create_checkout_session,
    create_portal_session,
    handle_event,
)

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


# --- Checkout e Customer Portal (issue #46) ----------------------------------
# Rotas AUTENTICADAS, ao contrário do webhook acima. Por serem autenticadas, o
# teto por usuário se aplica e o problema do IP atrás do proxy não aparece.

# Para onde o Stripe devolve a pessoa. Aponta para `/settings`, que EXISTE hoje;
# a `/perfil` é do #25 e ainda não foi construída — mandar a pessoa que acabou
# de pagar para uma rota inexistente seria trocar a compra por um 404.
ROTA_DE_VOLTA = "/settings"


class ConfirmCheckout(BaseModel):
    # 200 chars cobrem o `cs_...` com folga e evitam receber um texto qualquer.
    session_id: str = Field(min_length=1, max_length=200)


def _url(sufixo: str) -> str:
    return f"{settings.app_base_url.rstrip('/')}{ROTA_DE_VOLTA}{sufixo}"


@router.post("/checkout-session")
@limiter.limit("10/minute", key_func=user_key)
async def checkout_session(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Cria a sessão de Checkout hospedado e devolve a URL do Stripe."""
    if not settings.stripe_secret_key or not settings.stripe_price_id:
        # Billing ainda não provisionado (#26). Recusar alto é melhor do que
        # criar sessão contra um preço que não existe e jogar o erro cru do
        # Stripe na tela de quem quis pagar.
        raise HTTPException(status_code=503, detail="Assinatura ainda não disponível")

    try:
        url = await create_checkout_session(
            client_reference_id=str(current_user.id),
            price_id=settings.stripe_price_id,
            customer_id=current_user.stripe_customer_id,
            # O placeholder é substituído pelo próprio Stripe no redirect, e é
            # o que permite fechar a corrida da primeira compra na volta.
            success_url=_url("?checkout=success&session_id={CHECKOUT_SESSION_ID}"),
            cancel_url=_url("?checkout=cancel"),
        )
    except GatewayError as erro:
        logger.error("stripe: falha ao criar sessão de checkout: %s", erro)
        raise HTTPException(
            status_code=502,
            detail="Não foi possível abrir o pagamento agora. Tente novamente em instantes.",
        )
    return {"url": url}


@router.post("/portal-session")
@limiter.limit("10/minute", key_func=user_key)
async def portal_session(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Cria a sessão do Customer Portal: cancelar, trocar cartão, ver faturas."""
    if not current_user.stripe_customer_id:
        # Estado NORMAL de quem nunca comprou, então 409 com mensagem e não 500.
        raise HTTPException(
            status_code=409, detail="Você ainda não tem uma assinatura para gerenciar"
        )
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Assinatura ainda não disponível")

    try:
        url = await create_portal_session(
            customer_id=current_user.stripe_customer_id, return_url=_url("")
        )
    except GatewayError as erro:
        logger.error("stripe: falha ao criar sessão do portal: %s", erro)
        raise HTTPException(
            status_code=502,
            detail="Não foi possível abrir o gerenciamento agora. Tente novamente em instantes.",
        )
    return {"url": url}


@router.post("/confirm-checkout")
@limiter.limit("20/minute", key_func=user_key)
async def confirm_checkout_route(
    request: Request,
    payload: ConfirmCheckout,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chamado na volta do Checkout, com o id da sessão que veio na URL.

    Existe porque o redirect chega ANTES do webhook. Não substitui o webhook —
    ele segue sendo a fonte da verdade —, só antecipa em segundos o que ele
    traria, para a pessoa não voltar de uma compra bem-sucedida e ler que não é
    premium.
    """
    try:
        await confirm_checkout(current_user, payload.session_id, db)
    except CheckoutNotOurs:
        # 404 e não 403: para quem apresenta a sessão de outra pessoa, ela não
        # existe. Distinguir "não é sua" de "não existe" entregaria de graça a
        # confirmação de que aquele id é válido.
        logger.warning(
            "stripe: sessão de checkout apresentada por quem não é o dono (user=%s)",
            current_user.id,
        )
        raise HTTPException(status_code=404, detail="Sessão de pagamento não encontrada")
    except CheckoutNotPaid:
        raise HTTPException(status_code=409, detail="O pagamento ainda não foi concluído")
    except GatewayError as erro:
        logger.error("stripe: falha ao confirmar checkout: %s", erro)
        raise HTTPException(
            status_code=502, detail="Não foi possível confirmar o pagamento agora."
        )
    return {"confirmed": True}
