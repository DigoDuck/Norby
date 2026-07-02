import pytest

from app.services.score_service import compute_financial_score


@pytest.mark.parametrize(
    "income,expenses,expected",
    [
        (0, 0, None),      # sem dados
        (0, 500, 10),      # só gastos, sem receita
        (1000, 0, 100),    # poupou tudo
        (1000, 400, 100),  # s=0.6 -> 100
        (1000, 600, 95),   # s=0.4 -> 95
        (1000, 700, 90),   # s=0.3 -> 90 (borda)
        (1000, 850, 70),   # s=0.15 -> 70
        (1000, 1000, 50),  # s=0 -> 50 (borda)
        (1000, 1200, 30),  # s=-0.2 -> 30
        (1000, 1400, 10),  # s=-0.4 -> 10
        (1000, 1500, 0),   # s=-0.5 -> 0 (borda)
        (1000, 3000, 0),   # déficit extremo -> 0
    ],
)
def test_compute_financial_score(income, expenses, expected):
    summary = {"total_income": income, "total_expenses": expenses}
    assert compute_financial_score(summary) == expected
