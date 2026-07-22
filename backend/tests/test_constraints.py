"""Invariantes garantidas pelo banco, não pela API.

Estes testes escrevem direto pela sessão do SQLAlchemy, pulando os schemas do
Pydantic — é exatamente esse caminho (script, migration, psql) que as CHECK
constraints protegem.
"""
import datetime
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.sql_models import Transaction, TransactionType, User, Wallet


async def _user_and_wallet(make_auth_client, db_session):
    ac = await make_auth_client("Alice")
    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.email == me["email"]))).scalar_one()
    wallet = Wallet(user_id=user.id, name="Cofre", balance=Decimal("100.00"))
    db_session.add(wallet)
    await db_session.commit()
    return user, wallet


@pytest.mark.asyncio
async def test_db_rejects_negative_transaction_amount(make_auth_client, db_session):
    user, wallet = await _user_and_wallet(make_auth_client, db_session)
    db_session.add(
        Transaction(
            user_id=user.id,
            wallet_id=wallet.id,
            type=TransactionType.EXPENSE,
            amount=Decimal("-10.00"),
            category="Food",
            date=datetime.date(2026, 7, 21),
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_db_rejects_zero_transaction_amount(make_auth_client, db_session):
    user, wallet = await _user_and_wallet(make_auth_client, db_session)
    db_session.add(
        Transaction(
            user_id=user.id,
            wallet_id=wallet.id,
            type=TransactionType.INCOME,
            amount=Decimal("0.00"),
            category="Food",
            date=datetime.date(2026, 7, 21),
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
