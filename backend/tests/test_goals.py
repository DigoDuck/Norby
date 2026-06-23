import pytest
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.models.sql_models import User, Wallet, Transaction, TransactionType, Goal, GoalType
from app.services.goal_service import build_goal_response, month_spent


async def _seed(db):
    user = User(name="Al", email=f"al_{uuid.uuid4().hex[:8]}@t.com", password_hash="x")
    db.add(user)
    await db.flush()
    wallet = Wallet(user_id=user.id, name="Main", balance=Decimal("0"))
    db.add(wallet)
    await db.commit()
    return user, wallet


@pytest.mark.asyncio
async def test_savings_progress_uses_current_amount(db_session):
    user, _ = await _seed(db_session)
    goal = Goal(user_id=user.id, name="Trip", type=GoalType.SAVINGS,
                target_amount=Decimal("1000"), current_amount=Decimal("250"))
    db_session.add(goal)
    await db_session.commit()
    view = await build_goal_response(db_session, goal)
    assert view["current_amount"] == Decimal("250")
    assert view["progress_pct"] == 25.0
    assert view["remaining"] == Decimal("750")


@pytest.mark.asyncio
async def test_budget_progress_sums_month_expenses(db_session):
    user, wallet = await _seed(db_session)
    now = datetime.now(timezone.utc)
    db_session.add_all([
        Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
                    amount=Decimal("80"), category="Food", date=now),
        Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
                    amount=Decimal("40"), category="Food", date=now),
        Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.INCOME,
                    amount=Decimal("999"), category="Food", date=now),  # income ignorado
    ])
    await db_session.commit()
    goal = Goal(user_id=user.id, name="Food cap", type=GoalType.BUDGET,
                target_amount=Decimal("300"), category="Food")
    db_session.add(goal)
    await db_session.commit()
    view = await build_goal_response(db_session, goal)
    assert view["current_amount"] == Decimal("120")
    assert view["progress_pct"] == 40.0
