import pytest
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from app.models.sql_models import (
    User, Wallet, RecurringTransaction, RecurrenceFrequency, TransactionType, Transaction
)
from app.services.recurring_service import (
    advance, compute_initial_next_run, materialize_due_recurring
)
from sqlalchemy import select


def test_advance_weekly_adds_7_days():
    d = datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert advance(d, RecurrenceFrequency.WEEKLY) == datetime(2026, 6, 8, tzinfo=timezone.utc)


def test_advance_monthly_rolls_over_december():
    d = datetime(2026, 12, 10, tzinfo=timezone.utc)
    assert advance(d, RecurrenceFrequency.MONTHLY) == datetime(2027, 1, 10, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# compute_initial_next_run — pure-Python unit tests (no DB needed)
# ---------------------------------------------------------------------------

def test_compute_initial_next_run_monthly_day_already_passed():
    # now = 2026-06-15 12:00 UTC; day_of_month=1 → day 1 already passed this month
    # → result should be 2026-07-01 00:00 UTC (next month)
    now = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    result = compute_initial_next_run(RecurrenceFrequency.MONTHLY, day_of_month=1, weekday=None, now=now)
    assert result == datetime(2026, 7, 1, 0, 0, tzinfo=timezone.utc)


def test_compute_initial_next_run_monthly_day_still_ahead():
    # now = 2026-06-15 12:00 UTC; day_of_month=20 → day 20 is still ahead
    # → result should be 2026-06-20 00:00 UTC (this month)
    now = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    result = compute_initial_next_run(RecurrenceFrequency.MONTHLY, day_of_month=20, weekday=None, now=now)
    assert result == datetime(2026, 6, 20, 0, 0, tzinfo=timezone.utc)


def test_compute_initial_next_run_weekly_today_time_passed():
    # now = 2026-06-15 12:00 UTC; 2026-06-15 is a Monday (weekday=0)
    # target weekday=0 (Monday): candidate = 2026-06-15 00:00 UTC < now (12:00) → push +7
    # → result should be 2026-06-22 00:00 UTC (next Monday)
    now = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    result = compute_initial_next_run(RecurrenceFrequency.WEEKLY, day_of_month=None, weekday=0, now=now)
    assert result == datetime(2026, 6, 22, 0, 0, tzinfo=timezone.utc)


def test_compute_initial_next_run_weekly_later_this_week():
    # now = 2026-06-15 12:00 UTC; 2026-06-15 is a Monday (weekday=0)
    # target weekday=3 (Thursday): candidate = 2026-06-18 00:00 UTC > now → no push
    # → result should be 2026-06-18 00:00 UTC (this Thursday)
    now = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)
    result = compute_initial_next_run(RecurrenceFrequency.WEEKLY, day_of_month=None, weekday=3, now=now)
    assert result == datetime(2026, 6, 18, 0, 0, tzinfo=timezone.utc)


async def _seed_user_wallet(db, balance="100.00"):
    user = User(name="Al", email=f"al_{uuid.uuid4().hex[:8]}@t.com", password_hash="x")
    db.add(user)
    await db.flush()
    wallet = Wallet(user_id=user.id, name="Main", balance=Decimal(balance))
    db.add(wallet)
    await db.commit()
    return user, wallet


@pytest.mark.asyncio
async def test_materialize_generates_due_and_updates_balance(db_session):
    user, wallet = await _seed_user_wallet(db_session, "100.00")
    rec = RecurringTransaction(
        user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
        amount=Decimal("10.00"), category="Sub", frequency=RecurrenceFrequency.WEEKLY,
        weekday=0, next_run_date=datetime.now(timezone.utc) - timedelta(days=21),
        active=True,
    )
    db_session.add(rec)
    await db_session.commit()

    generated = await materialize_due_recurring(db_session, user)

    assert generated >= 3  # 3 semanas vencidas (catch-up)
    txs = (await db_session.execute(
        select(Transaction).where(Transaction.user_id == user.id)
    )).scalars().all()
    assert len(txs) == generated
    await db_session.refresh(wallet)
    assert wallet.balance == Decimal("100.00") - Decimal("10.00") * generated
    await db_session.refresh(rec)
    assert rec.next_run_date > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_materialize_is_idempotent(db_session):
    user, wallet = await _seed_user_wallet(db_session)
    rec = RecurringTransaction(
        user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
        amount=Decimal("10.00"), category="Sub", frequency=RecurrenceFrequency.MONTHLY,
        day_of_month=1, next_run_date=datetime.now(timezone.utc) - timedelta(days=2),
        active=True,
    )
    db_session.add(rec)
    await db_session.commit()

    first = await materialize_due_recurring(db_session, user)
    second = await materialize_due_recurring(db_session, user)
    assert first >= 1
    assert second == 0


@pytest.mark.asyncio
async def test_materialize_skips_inactive(db_session):
    user, wallet = await _seed_user_wallet(db_session)
    rec = RecurringTransaction(
        user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
        amount=Decimal("10.00"), category="Sub", frequency=RecurrenceFrequency.WEEKLY,
        weekday=0, next_run_date=datetime.now(timezone.utc) - timedelta(days=21),
        active=False,
    )
    db_session.add(rec)
    await db_session.commit()
    assert await materialize_due_recurring(db_session, user) == 0
