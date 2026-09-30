"""Ordem das travas de carteira entre caminhos (deadlock).

Transferência, edição de transação e /recurring/run travam carteiras com
FOR UPDATE. Se um caminho trava A e depois B enquanto outro trava B e depois A,
o Postgres aborta um dos dois e a pessoa vê um 500. A correção é todos travarem
em ordem crescente de id (`wallet_service.lock_order`).

Deadlock real não se reproduz de forma confiável aqui, então estes testes
observam a causa: a ordem em que os SELECT ... FOR UPDATE de carteira chegam
ao banco.
"""
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.sql_models import (
    RecurrenceFrequency, RecurringTransaction, TransactionType, User, Wallet
)
from app.services.recurring_service import materialize_due_recurring
from tests.conftest import test_engine


@contextmanager
def carteiras_travadas(ids):
    """Ids das carteiras em `ids`, na ordem em que foram travadas."""
    alvo = {str(i) for i in ids}
    ordem = []

    def ouvir(conn, cursor, statement, parameters, context, executemany):
        if "FOR UPDATE" not in statement or "FROM wallets" not in statement:
            return
        valores = parameters.values() if isinstance(parameters, dict) else parameters or ()
        for valor in valores:
            if str(valor) in alvo:
                ordem.append(str(valor))
                return

    event.listen(test_engine.sync_engine, "before_cursor_execute", ouvir)
    try:
        yield ordem
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", ouvir)


def _em_ordem(ids):
    return sorted(ids, key=uuid.UUID)


@pytest.mark.asyncio
async def test_moving_a_transaction_locks_both_wallets_in_id_order(make_auth_client):
    ac = await make_auth_client()
    a = (await ac.post("/wallets/", json={"name": "A", "balance": "100.00"})).json()
    b = (await ac.post("/wallets/", json={"name": "B", "balance": "100.00"})).json()
    # Sai da carteira de id MAIOR para a de id MENOR: travar "antiga, depois
    # nova" é exatamente a ordem errada.
    menor, maior = _em_ordem([a["id"], b["id"]])
    tx = (await ac.post(
        "/transactions/",
        json={
            "wallet_id": maior,
            "type": "EXPENSE",
            "amount": "10.00",
            "category": "Alimentação",
            "date": "2026-09-01",
        },
    )).json()

    with carteiras_travadas([menor, maior]) as ordem:
        res = await ac.put(f"/transactions/{tx['id']}", json={"wallet_id": menor})

    assert res.status_code == 200, res.text
    assert ordem == [menor, maior]


@pytest.mark.asyncio
async def test_recurring_run_locks_wallets_in_id_order(db_session):
    user = User(name="Al", email=f"al_{uuid.uuid4().hex[:8]}@t.com", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    w1 = Wallet(user_id=user.id, name="Uma", balance=Decimal("100.00"))
    w2 = Wallet(user_id=user.id, name="Outra", balance=Decimal("100.00"))
    db_session.add_all([w1, w2])
    await db_session.flush()
    menor, maior = sorted([w1, w2], key=lambda w: w.id)

    # Modelo da carteira de id MAIOR entra primeiro: sem ORDER BY, o SELECT dos
    # modelos tende a devolver na ordem de inserção, que aqui é a errada.
    vencido = datetime.now(timezone.utc) - timedelta(days=1)
    for carteira in (maior, menor):
        db_session.add(RecurringTransaction(
            user_id=user.id, wallet_id=carteira.id, type=TransactionType.EXPENSE,
            amount=Decimal("10.00"), category="Sub", frequency=RecurrenceFrequency.WEEKLY,
            weekday=0, next_run_date=vencido, active=True,
        ))
    await db_session.commit()

    with carteiras_travadas([w1.id, w2.id]) as ordem:
        gerados, pulados = await materialize_due_recurring(db_session, user)

    assert gerados >= 2 and pulados == []
    assert ordem == [str(menor.id), str(maior.id)]
