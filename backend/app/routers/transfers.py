from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.limiter import limiter, user_key
from app.models.sql_models import Transfer, User
from app.schemas.transfer import TransferCreate, TransferResponse
from app.services.transfer_service import create_transfer, delete_transfer

router = APIRouter(prefix="/transfers", tags=["Transfers"])


@router.get("/", response_model=list[TransferResponse])
async def list_transfers(
    wallet_id: UUID | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Transfer).where(Transfer.user_id == current_user.id)
    if wallet_id:
        stmt = stmt.where(
            or_(Transfer.from_wallet_id == wallet_id, Transfer.to_wallet_id == wallet_id)
        )
    stmt = stmt.order_by(Transfer.date.desc(), Transfer.created_at.desc()).limit(limit).offset(offset)
    return (await db.execute(stmt)).scalars().all()


@router.post("/", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
# Mesmo teto do POST /transactions (#158): escrita sem teto enche a carteira.
@limiter.limit("120/minute", key_func=user_key)
async def post_transfer(
    request: Request,
    payload: TransferCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_transfer(db, current_user, payload)


@router.delete("/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_transfer(
    transfer_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Trava a linha ANTES das carteiras (mesma ordem de _get_owned_transaction em
    # transactions.py): sem o lock, dois DELETE concorrentes leem a mesma
    # transferência, cada um trava as carteiras por sua vez e desfaz o efeito
    # duas vezes — o saldo sai duplicado, mesmo o segundo DELETE não apagando
    # nenhuma linha (o SQLAlchemy só avisa, não levanta erro, quando afeta 0 linhas).
    transfer = await db.scalar(
        select(Transfer)
        .where(Transfer.id == transfer_id, Transfer.user_id == current_user.id)
        .with_for_update()
    )
    if transfer is None:
        # Inexistente e "de outro dono" respondem igual (sem oráculo de ids).
        raise HTTPException(status_code=404, detail="Transferência não encontrada")
    await delete_transfer(db, current_user, transfer)
