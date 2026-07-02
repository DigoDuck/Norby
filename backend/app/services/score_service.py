"""Score de saúde financeira determinístico (0-100).

Calculado por regras a partir do resumo mensal do usuário, em vez de ser
inventado por um LLM: previsível, testável e instantâneo. Baseado na taxa de
poupança do mês corrente: s = (receita - despesa) / receita.
"""


def compute_financial_score(summary: dict) -> float | None:
    income = float(summary.get("total_income") or 0)
    expenses = float(summary.get("total_expenses") or 0)

    # Sem nenhum dado no mês → sem score (dashboard mostra "—").
    if income == 0 and expenses == 0:
        return None

    # Gastou sem nenhuma receita registrada: pior cenário com dados.
    if income == 0:
        return 10

    savings_rate = (income - expenses) / income

    if savings_rate >= 0.5:
        score = 100
    elif savings_rate >= 0.3:
        # 0.3 -> 90 ; 0.5 -> 100
        score = 90 + (savings_rate - 0.3) / 0.2 * 10
    elif savings_rate >= 0:
        # 0 -> 50 ; 0.3 -> 90
        score = 50 + savings_rate / 0.3 * 40
    elif savings_rate > -0.5:
        # 0 -> 50 ; -0.5 -> 0
        score = (savings_rate + 0.5) / 0.5 * 50
    else:
        score = 0

    return round(score)
