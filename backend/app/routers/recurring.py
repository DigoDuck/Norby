from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.dependencies import get_db, get_current_user
from app.models.sql_models import User, Wallet, RecurringTransaction
from app.schemas.recurring import RecurringCreate, RecurringUpdate, RecurringResponse
from app.services.recurring_service import compute_initial_next_run, materialize_due_recurring
from app.services.wallet_service import get_owned_wallet

router = APIRouter(prefix="/recurring", tags=["Recurring"])


async def _get_owned_recurring(
    recurring_id: UUID, user: User, db: AsyncSession
) -> RecurringTransaction:
    """Recorrência do usuário, ou 404. Espelha `_get_owned_goal` em goals.py."""
    rec = (await db.execute(
        select(RecurringTransaction).where(
            RecurringTransaction.id == recurring_id,
            RecurringTransaction.user_id == user.id,
        )
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recorrência não encontrada")
    return rec




@router.get("/", response_model=list[RecurringResponse])
async def list_recurring(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecurringTransaction)
        .where(RecurringTransaction.user_id == current_user.id)
        .order_by(RecurringTransaction.next_run_date.asc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.post("/", response_model=RecurringResponse, status_code=status.HTTP_201_CREATED)
async def create_recurring(
    payload: RecurringCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_owned_wallet(payload.wallet_id, current_user, db, for_write=True)

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
    rec = await _get_owned_recurring(recurring_id, current_user, db)

    # exclude_none: `null` explícito no corpo gravaria NULL em coluna NOT NULL.
    # `active: false` continua passando, porque False não é None.
    for field, value in payload.model_dump(exclude_none=True).items():
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
    rec = await _get_owned_recurring(recurring_id, current_user, db)
    await db.delete(rec)
    await db.commit()


@router.post("/run", response_model=dict[str, int])
async def run_recurring(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    generated = await materialize_due_recurring(db, current_user)
    return {"generated": generated}
