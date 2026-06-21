from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime
from typing import Optional
from app.dependencies import get_db, get_current_user
from app.models.sql_models import User, Transaction, TransactionType, Wallet
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionResponse
from decimal import Decimal

router = APIRouter(prefix="/transactions", tags=["Transactions"])

@router.get("/", response_model=list[TransactionResponse])
async def list_transactions(
    category: Optional[str] = Query(None),
    type: Optional[TransactionType] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Transaction.user_id == current_user.id]

    if category:
        filters.append(Transaction.category.ilike(f"%{category}%"))
    if type:
        filters.append(Transaction.type == type)
    if month and year:
        filters.append(
            and_(
                Transaction.date >= datetime(year, month, 1),
                Transaction.date < datetime(year, month % 12 + 1, 1) if month < 12
                    else datetime(year + 1, 1, 1),
            )
        )
    result = await db.execute(
        select(Transaction)
        .where(*filters)
        .order_by(Transaction.date.desc())
        .limit(200)
    )
    return result.scalars().all()

@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    payload: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verifica se a carteira pertence ao usuário
    wallet_result = await db.execute(
        select(Wallet).where(Wallet.id == payload.wallet_id, Wallet.user_id == current_user.id)
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Carteira não encontrada")

    # Atualiza o saldo
    if payload.type == TransactionType.INCOME:
        wallet.balance += payload.amount
    else:
        wallet.balance -= payload.amount
        
    transaction = Transaction(user_id=current_user.id, **payload.model_dump())
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    return transaction

@router.put("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: UUID,
    payload: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Busca a transação do usuário
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == current_user.id,
        )
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transação não encontrada")

    data = payload.model_dump(exclude_unset=True)

    # Valores finais: o que veio no payload sobrescreve o atual
    new_wallet_id = data.get("wallet_id", transaction.wallet_id)
    new_type = data.get("type", transaction.type)
    new_amount = data.get("amount", transaction.amount)

    # Carteira de origem (onde o efeito antigo está aplicado)
    old_wallet_result = await db.execute(
        select(Wallet).where(
            Wallet.id == transaction.wallet_id,
            Wallet.user_id == current_user.id,
        )
    )
    old_wallet = old_wallet_result.scalar_one_or_none()

    # Carteira de destino (pode ser a mesma)
    if new_wallet_id == transaction.wallet_id:
        new_wallet = old_wallet
    else:
        new_wallet_result = await db.execute(
            select(Wallet).where(
                Wallet.id == new_wallet_id,
                Wallet.user_id == current_user.id,
            )
        )
        new_wallet = new_wallet_result.scalar_one_or_none()
        if not new_wallet:
            raise HTTPException(status_code=404, detail="Carteira não encontrada")

    # 1) Reverte o efeito antigo (usa os valores AINDA não alterados da transação)
    if old_wallet:
        if transaction.type == TransactionType.INCOME:
            old_wallet.balance -= transaction.amount
        else:
            old_wallet.balance += transaction.amount

    # 2) Aplica o efeito novo na carteira de destino
    if new_wallet:
        if new_type == TransactionType.INCOME:
            new_wallet.balance += new_amount
        else:
            new_wallet.balance -= new_amount

    # 3) Atualiza os campos da transação
    for field, value in data.items():
        setattr(transaction, field, value)

    await db.commit()
    await db.refresh(transaction)
    return transaction

@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == current_user.id,
        )
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transação não encontrada")

    wallet_result = await db.execute(
        select(Wallet).where(
            Wallet.id == transaction.wallet_id,
            Wallet.user_id == current_user.id,
        )
    )
    wallet = wallet_result.scalar_one_or_none()
    if wallet:
        if transaction.type == TransactionType.INCOME:
            wallet.balance -= transaction.amount
        else:
            wallet.balance += transaction.amount
            
    await db.delete(transaction)
    await db.commit()