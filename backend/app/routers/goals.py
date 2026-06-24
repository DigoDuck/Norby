from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from decimal import Decimal

from app.dependencies import get_db, get_current_user
from app.models.sql_models import User, Goal, GoalType
from app.schemas.goal import GoalCreate, GoalUpdate, GoalContribute, GoalResponse
from app.services.goal_service import build_goal_response

router = APIRouter(prefix="/goals", tags=["Goals"])


async def _get_owned_goal(goal_id: UUID, user: User, db: AsyncSession) -> Goal:
    goal = (await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id)
    )).scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    return goal


@router.get("/", response_model=list[GoalResponse])
async def list_goals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goals = (await db.execute(
        select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.created_at.desc())
    )).scalars().all()
    return [await build_goal_response(db, g) for g in goals]


@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    payload: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = Goal(user_id=current_user.id, **payload.model_dump())
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return await build_goal_response(db, goal)


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: UUID,
    payload: GoalUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = await _get_owned_goal(goal_id, current_user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    await db.commit()
    await db.refresh(goal)
    return await build_goal_response(db, goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = await _get_owned_goal(goal_id, current_user, db)
    await db.delete(goal)
    await db.commit()


@router.post("/{goal_id}/contribute", response_model=GoalResponse)
async def contribute(
    goal_id: UUID,
    payload: GoalContribute,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    goal = await _get_owned_goal(goal_id, current_user, db)
    if goal.type != GoalType.SAVINGS:
        raise HTTPException(status_code=400, detail="Aportes só em metas do tipo SAVINGS")
    goal.current_amount += payload.amount
    if goal.current_amount < 0:
        goal.current_amount = Decimal("0")
    await db.commit()
    await db.refresh(goal)
    return await build_goal_response(db, goal)
