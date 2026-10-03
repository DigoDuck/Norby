from app.categories import EXPENSE_CATEGORIES, INCOME_CATEGORIES


def test_categories_match_the_app_lists():
    assert "Alimentação" in EXPENSE_CATEGORIES
    assert "Reembolso" in INCOME_CATEGORIES
    # "Outros" é o fallback das duas listas na importação.
    assert EXPENSE_CATEGORIES[-1] == "Outros" and INCOME_CATEGORIES[-1] == "Outros"
