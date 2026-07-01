import pytest
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from pydantic import ValidationError

from app.models.sql_models import User, Wallet, Transaction, TransactionType, Goal, GoalType
from app.schemas.goal import GoalCreate, GoalContribute
from app.services.goal_service import build_goal_response, month_spent, current_month_range


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
async def test_month_spent_includes_month_boundaries(db_session):
    # Guard de borda: o gasto do dia 1 e do último dia do mês entram no total;
    # o do último dia do mês anterior fica de fora. Comparando date-com-date,
    # o limite é exato e independe do timezone da sessão do banco.
    user, wallet = await _seed(db_session)
    start, end = current_month_range()
    first_day = start
    last_day = end - timedelta(days=1)
    prev_month_last_day = start - timedelta(days=1)
    db_session.add_all([
        Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
                    amount=Decimal("10"), category="Food", date=first_day),
        Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
                    amount=Decimal("20"), category="Food", date=last_day),
        Transaction(user_id=user.id, wallet_id=wallet.id, type=TransactionType.EXPENSE,
                    amount=Decimal("99"), category="Food", date=prev_month_last_day),
    ])
    await db_session.commit()
    total = await month_spent(db_session, user.id, "Food")
    assert total == Decimal("30")  # 10 + 20; o do mês anterior fica de fora


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


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_savings_goal(make_auth_client):
    ac = await make_auth_client("Alice")
    res = await ac.post("/goals/", json={
        "name": "Trip", "type": "SAVINGS", "target_amount": "1000", "current_amount": "100",
    })
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["category"] is None
    assert body["progress_pct"] == 10.0


@pytest.mark.asyncio
async def test_create_budget_requires_category(make_auth_client):
    ac = await make_auth_client("Alice")
    res = await ac.post("/goals/", json={
        "name": "Food cap", "type": "BUDGET", "target_amount": "300",
    })
    assert res.status_code == 422  # category faltando


@pytest.mark.asyncio
async def test_contribute_savings_updates_progress(make_auth_client):
    ac = await make_auth_client("Alice")
    goal = (await ac.post("/goals/", json={
        "name": "Trip", "type": "SAVINGS", "target_amount": "1000",
    })).json()
    res = await ac.post(f"/goals/{goal['id']}/contribute", json={"amount": "400"})
    assert res.status_code == 200
    assert res.json()["current_amount"] == "400.00"
    assert res.json()["progress_pct"] == 40.0


@pytest.mark.asyncio
async def test_contribute_on_budget_400(make_auth_client):
    ac = await make_auth_client("Alice")
    goal = (await ac.post("/goals/", json={
        "name": "Cap", "type": "BUDGET", "target_amount": "300", "category": "Food",
    })).json()
    res = await ac.post(f"/goals/{goal['id']}/contribute", json={"amount": "10"})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_goals_scoped_to_user(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    g = (await alice.post("/goals/", json={
        "name": "Trip", "type": "SAVINGS", "target_amount": "1000",
    })).json()
    assert len((await bob.get("/goals/")).json()) == 0
    res = await bob.post(f"/goals/{g['id']}/contribute", json={"amount": "10"})
    assert res.status_code == 404

    res = await bob.put(f"/goals/{g['id']}", json={"name": "Hijacked"})
    assert res.status_code == 404

    res = await bob.delete(f"/goals/{g['id']}")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Pure-Python unit tests — schema validators and month rollover
# ---------------------------------------------------------------------------

def test_budget_without_category_raises():
    with pytest.raises(ValidationError):
        GoalCreate(
            name="Cap",
            type="BUDGET",
            target_amount="300",
        )


def test_budget_clears_current_amount_and_deadline():
    g = GoalCreate(
        name="Food cap",
        type="BUDGET",
        category="Food",
        target_amount="300",
        current_amount="50",
        deadline=datetime(2025, 12, 31, tzinfo=timezone.utc),
    )
    assert g.current_amount == Decimal("0")
    assert g.deadline is None


def test_savings_clears_category():
    g = GoalCreate(
        name="Trip",
        type="SAVINGS",
        category="X",
        target_amount="1000",
    )
    assert g.category is None


def test_contribute_zero_raises():
    with pytest.raises(ValidationError):
        GoalContribute(amount=Decimal("0"))


def test_current_month_range_december_rollover():
    start, end = current_month_range(datetime(2025, 12, 15, tzinfo=timezone.utc))
    assert start == date(2025, 12, 1)
    assert end == date(2026, 1, 1)


def test_current_month_range_returns_date_not_datetime():
    # Comparar coluna DATE com date (não datetime tz-aware) elimina o cast
    # implícito no timezone da sessão do Postgres — a correção de raiz da suspeita
    # de borda de mês em metas BUDGET.
    start, end = current_month_range(datetime(2026, 7, 15, tzinfo=timezone.utc))
    assert type(start) is date and type(end) is date
    assert start == date(2026, 7, 1)
    assert end == date(2026, 8, 1)
