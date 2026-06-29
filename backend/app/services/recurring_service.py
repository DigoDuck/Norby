from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sql_models import (
    User, Wallet, RecurringTransaction, RecurrenceFrequency, Transaction, TransactionType
)


def add_one_month(d: datetime) -> datetime:
    # day_of_month é capado em 28, então preservar o dia é sempre seguro.
    if d.month == 12:
        return d.replace(year=d.year + 1, month=1)
    return d.replace(month=d.month + 1)


def advance(d: datetime, frequency: RecurrenceFrequency) -> datetime:
    if frequency == RecurrenceFrequency.WEEKLY:
        return d + timedelta(days=7)
    return add_one_month(d)


def compute_initial_next_run(frequency, day_of_month, weekday, now=None) -> datetime:
    now = now or datetime.now(timezone.utc)
    if frequency == RecurrenceFrequency.MONTHLY:
        candidate = now.replace(
            day=day_of_month, hour=0, minute=0, second=0, microsecond=0
        )
        if candidate < now:
            candidate = add_one_month(candidate)
        return candidate
    # WEEKLY
    base = now.replace(hour=0, minute=0, second=0, microsecond=0)
    days_ahead = (weekday - base.weekday()) % 7
    candidate = base + timedelta(days=days_ahead)
    if candidate < now:
        candidate = candidate + timedelta(days=7)
    return candidate


async def materialize_due_recurring(db: AsyncSession, user: User) -> int:
    now = datetime.now(timezone.utc)
    templates = (await db.execute(
        select(RecurringTransaction).where(
            RecurringTransaction.user_id == user.id,
            RecurringTransaction.active.is_(True),
            RecurringTransaction.next_run_date <= now,
        ).with_for_update()
    )).scalars().all()

    generated = 0
    for tpl in templates:
        wallet = (await db.execute(
            select(Wallet).where(
                Wallet.id == tpl.wallet_id, Wallet.user_id == user.id
            )
        )).scalar_one_or_none()

        while tpl.next_run_date <= now:
            db.add(Transaction(
                user_id=user.id,
                wallet_id=tpl.wallet_id,
                type=tpl.type,
                amount=tpl.amount,
                category=tpl.category,
                description=tpl.description,
                date=tpl.next_run_date.date(),
            ))
            if wallet is not None:
                if tpl.type == TransactionType.INCOME:
                    wallet.balance += tpl.amount
                else:
                    wallet.balance -= tpl.amount
            tpl.next_run_date = advance(tpl.next_run_date, tpl.frequency)
            generated += 1

    await db.commit()
    return generated
