from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.dependencies import get_db, get_current_user
from app.models.sql_models import User, Wallet, RecurringTransaction
from app.schemas.recurring import RecurringCreate, RecurringUpdate, RecurringResponse
from app.services.recurring_service import compute_initial_next_run, materialize_due_recurring

router = APIRouter(prefix="/recurring", tags=["Recurring"])


@router.get("/", response_model=list[RecurringResponse])
async def list_recurring(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecurringTransaction)
        .where(RecurringTransaction.user_id == current_user.id)
        .order_by(RecurringTransaction.next_run_date.asc())
    )
    return result.scalars().all()


@router.post("/", response_model=RecurringResponse, status_code=status.HTTP_201_CREATED)
async def create_recurring(
    payload: RecurringCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wallet = (await db.execute(
        select(Wallet).where(Wallet.id == payload.wallet_id, Wallet.user_id == current_user.id)
    )).scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Carteira não encontrada")

    next_run = compute_initial_next_run(
        payload.frequency, payload.day_of_month, payload.weekday
    )
    rec = RecurringTransaction(
        user_id=current_user.id, next_run_date=next_run, **payload.model_dump()
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.put("/{recurring_id}", response_model=RecurringResponse)
async def update_recurring(
    recurring_id: UUID,
    payload: RecurringUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rec = (await db.execute(
        select(RecurringTransaction).where(
            RecurringTransaction.id == recurring_id,
            RecurringTransaction.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrência não encontrada")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, value)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring(
    recurring_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rec = (await db.execute(
        select(RecurringTransaction).where(
            RecurringTransaction.id == recurring_id,
            RecurringTransaction.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrência não encontrada")
    await db.delete(rec)
    await db.commit()


@router.post("/run")
async def run_recurring(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    generated = await materialize_due_recurring(db, current_user)
    return {"generated": generated}
