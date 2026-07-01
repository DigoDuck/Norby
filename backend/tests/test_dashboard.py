import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.models.sql_models import User, Wallet, Transaction, TransactionType
from app.services.auth_service import create_access_token


def _month_start(ref, n_back):
    total = ref.year * 12 + (ref.month - 1) - n_back
    return ref.replace(year=total // 12, month=total % 12 + 1, day=1)


@pytest.mark.asyncio
async def test_dashboard_summary_aggregates_over_all_transactions(db_session, client):
    # Semeia >200 transações no mês atual: o Dashboard antigo cortava em 200 e
    # agregava errado no cliente. O endpoint agrega no Postgres, sem cap.
    user = User(name="Al", email=f"al_{uuid.uuid4().hex[:8]}@t.com", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    wallet = Wallet(user_id=user.id, name="Main", balance=Decimal("0"))
    db_session.add(wallet)
    await db_session.commit()

    today = datetime.now(timezone.utc).date()
    cur = today.replace(day=1)
    prev1 = _month_start(cur, 1)

    txs = [
        Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
                    amount=Decimal("10"), category="Food", date=cur)
        for _ in range(250)
    ]
    txs.append(Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.INCOME,
                           amount=Decimal("500"), category="Salary", date=cur))
    txs.append(Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
                           amount=Decimal("100"), category="Rent", date=prev1))
    db_session.add_all(txs)
    await db_session.commit()

    token = create_access_token(str(user.id))
    res = await client.get("/dashboard/summary", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()

    # KPIs do mês atual — 250 despesas de 10 = 2500 (prova que não capa em 200).
    assert float(body["month_expenses"]) == 2500.0
    assert float(body["month_income"]) == 500.0
    assert float(body["prev_month_expenses"]) == 100.0
    assert float(body["prev_month_income"]) == 0.0

    # Fluxo de caixa: 2 meses com dados, cronológico, mês atual por último.
    assert len(body["cash_flow"]) == 2
    assert body["cash_flow"][-1]["month"] == cur.strftime("%Y-%m")
    assert float(body["cash_flow"][-1]["expenses"]) == 2500.0
    assert float(body["cash_flow"][-1]["income"]) == 500.0
    assert body["cash_flow"][0]["month"] == prev1.strftime("%Y-%m")

    # Top categorias do mês: Food domina com 2500.
    assert body["top_categories"][0]["category"] == "Food"
    assert float(body["top_categories"][0]["total"]) == 2500.0


@pytest.mark.asyncio
async def test_dashboard_summary_requires_auth(client):
    res = await client.get("/dashboard/summary")
    assert res.status_code == 401
