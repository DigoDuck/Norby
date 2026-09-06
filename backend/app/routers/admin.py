"""Rotas da área de admin (issue #23, ADR 0004). Router próprio: `grep admin`
responde "o que o admin alcança"."""

import asyncio
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_db, require_admin
from app.limiter import limiter, user_key
from app.models.sql_models import User
from app.routers.auth import ROTA_REDEFINIR, mandar_link_de_recuperacao
from app.schemas.admin import AdminActionRequest, AdminMetrics, AdminUserOut
from app.services import admin_service
from app.services.auth_service import verify_password
from app.services.billing_service import GatewayCancelFailed

router = APIRouter(prefix="/admin", tags=["Admin"])


async def _alvo(db: AsyncSession, admin: User, user_id: uuid.UUID, senha: str) -> User:
    """Ordem fixa: senha, depois "é você mesmo", depois "existe". A senha vem
    primeiro para que nenhuma outra resposta vaze antes do step-up."""
    if not await asyncio.to_thread(verify_password, senha, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha incorreta")
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use as Configurações para agir na própria conta")
    alvo = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if alvo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return alvo


@router.get("/metrics", response_model=AdminMetrics)
@limiter.limit("30/minute", key_func=user_key)
async def metrics(request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await admin_service.metricas(db)


@router.get("/users", response_model=list[AdminUserOut])
@limiter.limit("30/minute", key_func=user_key)
async def users(request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await admin_service.listar_usuarios(db)


@router.post("/users/{user_id}/cancel-subscription", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute", key_func=user_key)
async def cancel_subscription(
    request: Request, user_id: uuid.UUID, payload: AdminActionRequest,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db),
):
    alvo = await _alvo(db, admin, user_id, payload.password)
    try:
        await admin_service.cancelar_assinatura(db, admin=admin, alvo=alvo)
    except admin_service.SemAssinatura:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este usuário não tem assinatura ativa")
    except GatewayCancelFailed:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="O Stripe recusou o cancelamento. Tente de novo.")


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute", key_func=user_key)
async def delete_user(
    request: Request, user_id: uuid.UUID, payload: AdminActionRequest,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db),
):
    alvo = await _alvo(db, admin, user_id, payload.password)
    try:
        await admin_service.excluir_conta(db, admin=admin, alvo=alvo)
    except GatewayCancelFailed:
        # Mesma regra do DELETE /auth/me: assinatura viva que o Stripe não
        # cancelou, NADA é apagado.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="O Stripe recusou o cancelamento; a conta não foi excluída.")


@router.post("/users/{user_id}/recovery-email", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute", key_func=user_key)
async def recovery_email(
    request: Request, user_id: uuid.UUID, payload: AdminActionRequest, background: BackgroundTasks,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db),
):
    if not get_settings().brevo_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Recuperação de senha indisponível")
    alvo = await _alvo(db, admin, user_id, payload.password)
    link = await admin_service.preparar_recuperacao(
        db, admin=admin, alvo=alvo, base_url=get_settings().app_base_url, rota=ROTA_REDEFINIR,
    )
    background.add_task(mandar_link_de_recuperacao, alvo.email, link)
    return {"detail": "Link de redefinição enviado ao e-mail do usuário."}
