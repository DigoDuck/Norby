"""Popula uma conta de demonstração com 6 meses de dados plausíveis.

Existe por dois motivos:
  1. Screenshot do README sem expor dado financeiro real de ninguém.
  2. O link público de demo cair numa conta com conteúdo — hoje o visitante se
     cadastra e encontra um app vazio, que é pior do que não ter link.

Bate na API HTTP de propósito, em vez de escrever direto no banco: assim a
lógica real roda igual à de produção (saldo por delta sob lock, validação dos
schemas, escopo por usuário) e o mesmo script serve local e prod trocando
SEED_API_URL. Escrever no banco duplicaria a regra dos routers e ia derivar.

    docker exec norby_backend python scripts/seed_demo.py
    SEED_API_URL=https://norby-production.up.railway.app python scripts/seed_demo.py

    python scripts/seed_demo.py --check   # valida os dados gerados, sem servidor

Recusa rodar se a conta já tiver carteiras, para não empilhar dados repetidos.
"""
import os
import random
import sys
from datetime import date, datetime

import httpx

API = os.getenv("SEED_API_URL", "http://localhost:8000").rstrip("/")
EMAIL = os.getenv("SEED_EMAIL", "demo@norby.dev")
PASSWORD = os.getenv("SEED_PASSWORD", "demo12345")
NAME = os.getenv("SEED_NAME", "Ana Ribeiro")

MONTHS = 6  # o dashboard plota os 6 últimos meses COM dados (desc + limit 6)

CORRENTE, POUPANCA = "Conta Corrente", "Poupança"

# (dia, carteira, tipo, categoria, descrição, valor base, jitter)
# As categorias saem de frontend/src/lib/categories.js — string fora daquela
# lista renderiza sem ícone no dashboard.
# Os custos fixos ficam concentrados no começo do mês (aluguel, condomínio,
# plano de saúde), que é o padrão real e faz o mês corrente já ter volume
# mesmo cortado no dia de hoje.
MONTHLY = [
    (5,  CORRENTE, "INCOME",  "Salário",           "Salário",          7200.00, 0.00),
    (1,  POUPANCA, "INCOME",  "Investimentos",     "Rendimento",         42.00, 0.20),
    (10, CORRENTE, "EXPENSE", "Moradia",           "Aluguel",          1800.00, 0.00),
    (10, CORRENTE, "EXPENSE", "Moradia",           "Condomínio",        480.00, 0.00),
    (12, CORRENTE, "EXPENSE", "Contas & Serviços", "Energia",           192.00, 0.15),
    (12, CORRENTE, "EXPENSE", "Contas & Serviços", "Água",               88.00, 0.15),
    (12, CORRENTE, "EXPENSE", "Contas & Serviços", "Internet",          109.90, 0.00),
    (6,  CORRENTE, "EXPENSE", "Contas & Serviços", "Celular",            59.90, 0.00),
    (15, CORRENTE, "EXPENSE", "Saúde",             "Plano de saúde",    328.00, 0.00),
    (2,  CORRENTE, "EXPENSE", "Saúde",             "Farmácia",           87.00, 0.25),
    (8,  CORRENTE, "EXPENSE", "Lazer",             "Streaming",          55.90, 0.00),
    (15, CORRENTE, "EXPENSE", "Lazer",             "Cinema",             62.00, 0.20),
    (3,  CORRENTE, "EXPENSE", "Alimentação",       "Mercado do mês",    620.00, 0.12),
    (14, CORRENTE, "EXPENSE", "Alimentação",       "Mercado",           280.00, 0.15),
    (16, CORRENTE, "EXPENSE", "Alimentação",       "Mercado",           265.00, 0.15),
    (7,  CORRENTE, "EXPENSE", "Alimentação",       "Restaurante",        96.00, 0.20),
    (13, CORRENTE, "EXPENSE", "Alimentação",       "iFood",              74.00, 0.25),
    (2,  CORRENTE, "EXPENSE", "Transporte",        "Combustível",       195.00, 0.15),
    (4,  CORRENTE, "EXPENSE", "Transporte",        "Combustível",       210.00, 0.15),
    (11, CORRENTE, "EXPENSE", "Transporte",        "Uber",               68.00, 0.30),
    (9,  CORRENTE, "EXPENSE", "Educação",          "Curso online",      129.90, 0.00),
    (16, CORRENTE, "EXPENSE", "Compras",           "Roupas",            240.00, 0.30),
    # Segunda metade do mês: só entra em meses já fechados, porque o mês
    # corrente é cortado em "hoje" (lançamento no futuro denuncia o seed).
    (18, CORRENTE, "EXPENSE", "Compras",           "Presente",          160.00, 0.40),
    (20, CORRENTE, "EXPENSE", "Alimentação",       "Mercado",           290.00, 0.15),
    (22, CORRENTE, "EXPENSE", "Lazer",             "Bar com amigos",    140.00, 0.30),
    (24, CORRENTE, "EXPENSE", "Contas & Serviços", "Assinaturas",        39.90, 0.00),
    (25, CORRENTE, "EXPENSE", "Transporte",        "Combustível",       200.00, 0.15),
    (27, CORRENTE, "EXPENSE", "Alimentação",       "Restaurante",       110.00, 0.25),
]

# Receita extra em alguns meses (chave = quantos meses atrás): sem isso as
# barras do fluxo de caixa ficam idênticas e o gráfico parece falso.
EXTRA = {
    4: (18, CORRENTE, "INCOME", "Freelance/Extra", "Projeto freelance", 1500.00, 0.00),
    2: (22, CORRENTE, "INCOME", "Freelance/Extra", "Landing page",       900.00, 0.00),
}


def month_start(today: date, back: int) -> date:
    y, m = today.year, today.month - back
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def rows_for(today: date) -> list[tuple]:
    """Gera os lançamentos dos últimos MONTHS meses, nada depois de `today`."""
    rng = random.Random(42)  # local e com seed fixa: mesma entrada, mesma saída
    out = []
    for back in range(MONTHS - 1, -1, -1):
        start = month_start(today, back)
        items = list(MONTHLY)
        if back in EXTRA:
            items.append(EXTRA[back])
        for day, wallet, type_, cat, desc, base, jitter in items:
            d = start.replace(day=day)  # todo dia <= 28, seguro até em fevereiro
            if d > today:
                continue
            amount = round(base * (1 + rng.uniform(-jitter, jitter)), 2)
            out.append((d, wallet, type_, cat, desc, amount))
    out.sort(key=lambda r: r[0])
    return out


def _token(c: httpx.Client) -> str:
    r = c.post("/auth/register", json={"name": NAME, "email": EMAIL, "password": PASSWORD})
    if r.status_code == 201:
        return r.json()["access_token"]
    r = c.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    r.raise_for_status()
    return r.json()["access_token"]


def main() -> None:
    today = date.today()
    # As rotas são declaradas com barra final; sem ela o FastAPI responde 301 e
    # o POST vira GET (405). Manter a barra em todo path de coleção.
    with httpx.Client(base_url=API, timeout=30) as c:
        c.headers["Authorization"] = f"Bearer {_token(c)}"

        existing = c.get("/wallets/").json()
        if existing:
            sys.exit(
                f"{EMAIL} já tem {len(existing)} carteira(s). Apague a conta "
                f"(DELETE /auth/me) ou use outro SEED_EMAIL."
            )

        wallets = {}
        for name, opening in ((CORRENTE, "0.00"), (POUPANCA, "8000.00")):
            r = c.post("/wallets/", json={"name": name, "balance": opening})
            r.raise_for_status()
            wallets[name] = r.json()["id"]

        rows = rows_for(today)
        for d, wallet, type_, cat, desc, amount in rows:
            r = c.post("/transactions/", json={
                "wallet_id": wallets[wallet],
                "type": type_,
                "amount": f"{amount:.2f}",
                "category": cat,
                "description": desc,
                "date": d.isoformat(),
            })
            r.raise_for_status()

        year_end = datetime(today.year, 12, 31).isoformat()
        for goal in (
            {"name": "Reserva de emergência", "type": "SAVINGS",
             "target_amount": "20000.00", "current_amount": "8200.00",
             "deadline": year_end},
            {"name": "Notebook novo", "type": "SAVINGS",
             "target_amount": "7500.00", "current_amount": "2800.00",
             "deadline": year_end},
            # BUDGET tira o progresso das transações do mês (month_spent).
            {"name": "Teto de Alimentação", "type": "BUDGET",
             "target_amount": "1800.00", "category": "Alimentação"},
        ):
            c.post("/goals/", json=goal).raise_for_status()

        # day_of_month já passou neste mês, então next_run_date cai no mês que
        # vem: o POST /recurring/run do boot não materializa nada agora.
        for rec in (
            {"wallet_id": wallets[CORRENTE], "type": "INCOME", "amount": "7200.00",
             "category": "Salário", "description": "Salário",
             "frequency": "MONTHLY", "day_of_month": 5},
            {"wallet_id": wallets[CORRENTE], "type": "EXPENSE", "amount": "1800.00",
             "category": "Moradia", "description": "Aluguel",
             "frequency": "MONTHLY", "day_of_month": 10},
        ):
            c.post("/recurring/", json=rec).raise_for_status()

        print(f"ok — {EMAIL} / {PASSWORD}: {len(rows)} lançamentos, "
              f"2 carteiras, 3 metas, 2 recorrências em {API}")


def _selfcheck() -> None:
    """Trava o que quebraria o screenshot em silêncio: data no futuro, mês
    faltando no gráfico, ou score fora da faixa 'boa mas crível'."""
    today = date(2026, 7, 16)
    rows = rows_for(today)

    assert all(d <= today for d, *_ in rows), "lançamento no futuro"

    months = {(d.year, d.month) for d, *_ in rows}
    assert len(months) == MONTHS, f"esperado {MONTHS} meses no gráfico, veio {len(months)}"

    cur = [r for r in rows if (r[0].year, r[0].month) == (today.year, today.month)]
    income = sum(a for _, _, t, _, _, a in cur if t == "INCOME")
    expenses = sum(a for _, _, t, _, _, a in cur if t == "EXPENSE")
    rate = (income - expenses) / income
    # score_service: 0% -> 50, 30% -> 90. Faixa 15-30% => score ~70-90.
    # Poupar 50%+ crava 100 e um 100 no README cheira a dado fabricado.
    assert 0.15 <= rate <= 0.30, f"taxa de poupança fora da faixa: {rate:.1%}"

    cats = {c for _, _, t, c, _, _ in cur if t == "EXPENSE"}
    assert len(cats) >= 5, f"top categorias do mês precisa de 5+, veio {len(cats)}"

    print(f"ok — {len(rows)} lançamentos, {len(months)} meses, "
          f"poupança {rate:.1%}, {len(cats)} categorias no mês")


if __name__ == "__main__":
    if "--check" in sys.argv:
        _selfcheck()
    else:
        main()
