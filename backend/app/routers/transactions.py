from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import date
from typing import Optional
from app.dependencies import get_db, get_current_user
from app.models.sql_models import User, Transaction, TransactionType, Wallet
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionResponse
from app.services.transaction_service import apply_delta, revert_delta
from app.services.goal_service import current_month_range

router = APIRouter(prefix="/transactions", tags=["Transactions"])


async def _get_owned_wallet(
    wallet_id: UUID,
    user: User,
    db: AsyncSession,
    *,
    for_update: bool = False,
    required: bool = True,
) -> Optional[Wallet]:
    """Carteira do usuário, com lock opcional (with_for_update) p/ mutar saldo.

    Espelha o padrão de `_get_owned_goal` em goals.py. Com required=True (padrão)
    levanta 404 se não for do usuário; required=False devolve None (usado para a
    carteira de origem no update, cujo efeito antigo é revertido de forma tolerante).
    """
    stmt = select(Wallet).where(Wallet.id == wallet_id, Wallet.user_id == user.id)
    if for_update:
        stmt = stmt.with_for_update()
    wallet = (await db.execute(stmt)).scalar_one_or_none()
    if wallet is None and required:
        raise HTTPException(status_code=404, detail="Carteira não encontrada")
    return wallet


async def _get_owned_transaction(transaction_id: UUID, user: User, db: AsyncSession) -> Transaction:
    transaction = (await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == user.id,
        )
    )).scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    return transaction


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
        # Intervalo [início do mês, início do mês seguinte) — helper único, correto p/ dezembro
        start, end = current_month_range(date(year, month, 1))
        filters.append(Transaction.date >= start)
        filters.append(Transaction.date < end)
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
    wallet = await _get_owned_wallet(payload.wallet_id, current_user, db, for_update=True)
    apply_delta(wallet, payload.type, payload.amount)

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
    transaction = await _get_owned_transaction(transaction_id, current_user, db)

    data = payload.model_dump(exclude_unset=True)

    # Valores finais: o que veio no payload sobrescreve o atual
    new_wallet_id = data.get("wallet_id", transaction.wallet_id)
    new_type = data.get("type", transaction.type)
    new_amount = data.get("amount", transaction.amount)

    # Carteira de origem (onde o efeito antigo está aplicado). Tolerante a None:
    # preserva o comportamento defensivo anterior.
    old_wallet = await _get_owned_wallet(
        transaction.wallet_id, current_user, db, for_update=True, required=False
    )

    # Carteira de destino (pode ser a mesma)
    if new_wallet_id == transaction.wallet_id:
        new_wallet = old_wallet
    else:
        new_wallet = await _get_owned_wallet(new_wallet_id, current_user, db, for_update=True)

    # 1) Reverte o efeito antigo (usa os valores AINDA não alterados da transação)
    if old_wallet:
        revert_delta(old_wallet, transaction.type, transaction.amount)

    # 2) Aplica o efeito novo na carteira de destino
    if new_wallet:
        apply_delta(new_wallet, new_type, new_amount)

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
    db: AsyncSession = Depends(get_db),
):
    transaction = await _get_owned_transaction(transaction_id, current_user, db)

    wallet = await _get_owned_wallet(
        transaction.wallet_id, current_user, db, for_update=True, required=False
    )
    if wallet:
        revert_delta(wallet, transaction.type, transaction.amount)

    await db.delete(transaction)
    await db.commit()
