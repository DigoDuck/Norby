from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.dependencies import get_db, get_current_user
from app.models.sql_models import User, Wallet
from app.schemas.wallet import WalletCreate, WalletUpdate, WalletResponse
from app.services.wallet_service import ensure_can_create_wallet, get_owned_wallet

router = APIRouter(prefix="/wallets", tags=["Wallets"])


@router.get("/", response_model=list[WalletResponse]) 
async def list_wallets( # Retorna a lista de carteiras do usuário
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Wallet)
        .where(Wallet.user_id == current_user.id)
        .order_by(Wallet.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()

@router.post("/", response_model=WalletResponse, status_code=status.HTTP_201_CREATED)
async def create_wallet(
    payload: WalletCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_create_wallet(current_user, db)
    wallet = Wallet(user_id=current_user.id, **payload.model_dump())
    db.add(wallet)
    await db.commit()
    await db.refresh(wallet)
    return wallet

@router.put("/{wallet_id}", response_model=WalletResponse)
async def update_wallet(
    wallet_id: UUID,
    payload: WalletUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    wallet = await get_owned_wallet(wallet_id, current_user, db, for_write=True)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(wallet, field, value)

    await db.commit()
    await db.refresh(wallet)
    return wallet

@router.delete("/{wallet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wallet(
    wallet_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Sem for_write: excluir carteira bloqueada é PERMITIDO de propósito. É a
    # única saída de quem tem 5 carteiras e virou free — recusar transformaria o
    # teto numa armadilha em vez de um limite (ADR 0002).
    wallet = await get_owned_wallet(wallet_id, current_user, db)

    await db.delete(wallet)
    await db.commit()