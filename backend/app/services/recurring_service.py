from datetime import datetime, timezone, timedelta
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sql_models import (
    User, Wallet, RecurringTransaction, RecurrenceFrequency, Transaction
)
from app.services.transaction_service import apply_delta
from app.services.plan_service import PlanRefused
from app.services.wallet_service import get_owned_wallet


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


class Materializacao(NamedTuple):
    """O que a rodada fez, e o que ela deixou de fazer.

    `skipped` existe porque parar em silêncio é pior que vazar o paywall: seria
    a pessoa descobrindo em março que o aluguel não é lançado desde janeiro.
    """

    generated: int
    skipped: list[dict]


async def materialize_due_recurring(db: AsyncSession, user: User) -> Materializacao:
    now = datetime.now(timezone.utc)
    templates = (await db.execute(
        select(RecurringTransaction).where(
            RecurringTransaction.user_id == user.id,
            RecurringTransaction.active.is_(True),
            RecurringTransaction.next_run_date <= now,
        ).with_for_update()
    )).scalars().all()

    generated = 0
    skipped: list[dict] = []
    for tpl in templates:
        # Passa pelo helper do ADR 0002 em vez de reimplementar a regra: assim
        # existe UM lugar decidindo o que é carteira bloqueada, e a recorrência
        # não pode divergir das escritas manuais. `required=False` preserva a
        # tolerância antiga a carteira sumida.
        try:
            wallet = await get_owned_wallet(
                tpl.wallet_id, user, db, for_update=True, required=False, for_write=True
            )
        except PlanRefused as recusa:
            # O template NÃO é desativado nem apagado. Quem assinar, ou drenar e
            # apagar uma carteira, volta a materializar sozinho — e as ocorrências
            # puladas entram na próxima rodada, porque a materialização é guiada
            # por data, não por execução.
            skipped.append(
                {
                    "recurring_id": str(tpl.id),
                    "wallet_id": str(tpl.wallet_id),
                    "code": recusa.code,
                }
            )
            continue

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
                apply_delta(wallet, tpl.type, tpl.amount)
            tpl.next_run_date = advance(tpl.next_run_date, tpl.frequency)
            generated += 1

    await db.commit()
    return Materializacao(generated=generated, skipped=skipped)
