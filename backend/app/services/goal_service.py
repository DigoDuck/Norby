from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sql_models import Transaction, TransactionType, Goal, GoalType


def current_month_range(now: datetime | None = None):
    now = now or datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return start, end


async def month_spent(db: AsyncSession, user_id, category: str) -> Decimal:
    start, end = current_month_range()
    total = (await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.category == category,
            Transaction.date >= start,
            Transaction.date < end,
        )
    )).scalar_one()
    return Decimal(str(total))


async def build_goal_response(db: AsyncSession, goal: Goal) -> dict:
    if goal.type == GoalType.SAVINGS:
        current = goal.current_amount
    else:
        current = await month_spent(db, goal.user_id, goal.category)

    target = goal.target_amount
    progress = float(current / target * 100) if target and target > 0 else 0.0
    return {
        "id": goal.id,
        "name": goal.name,
        "type": goal.type,
        "target_amount": target,
        "current_amount": current,
        "category": goal.category,
        "deadline": goal.deadline,
        "created_at": goal.created_at,
        "progress_pct": round(progress, 1),
        "remaining": target - current,
    }
