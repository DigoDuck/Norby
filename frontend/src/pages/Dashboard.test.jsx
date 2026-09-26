import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { aiApi } from "@/api/ai";
import { dashboardApi } from "@/api/dashboard";
import { goalsApi } from "@/api/goals";
import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { useAuthStore } from "@/store/authStore";
import Dashboard from "./Dashboard";

vi.mock("@/api/ai", () => ({ aiApi: { getInsight: vi.fn() } }));
vi.mock("@/api/dashboard", () => ({ dashboardApi: { summary: vi.fn() } }));
vi.mock("@/api/goals", () => ({ goalsApi: { list: vi.fn() } }));
vi.mock("@/api/transactions", () => ({ transactionsApi: { list: vi.fn() } }));
vi.mock("@/api/wallets", () => ({ walletsApi: { list: vi.fn() } }));

// O `plan` do UserResponse inteiro (ADR 0002): os dois booleanos mandam, o
// resto é exibição.
const FREE = {
  ai_allowed: false,
  wallet_cap_applies: true,
  premium_until: null,
  ai_trial_ends_at: null,
  subscription_status: null,
  cancel_at_period_end: false,
};
const PREMIUM = {
  ai_allowed: true,
  wallet_cap_applies: false,
  premium_until: "2026-10-25T00:00:00Z",
  ai_trial_ends_at: null,
  subscription_status: "active",
  cancel_at_period_end: false,
};

// Decimal chega do FastAPI como string.
const resumo = (receita, despesa, extra = {}) => ({
  data: {
    month_income: receita,
    month_expenses: despesa,
    cash_flow: [],
    top_categories: [],
    ...extra,
  },
});

// Recusa do /ai/insight para quem não pode gerar (CONTEXT.md).
const recusaIa = () =>
  Promise.reject(
    Object.assign(new Error("403"), {
      response: { status: 403, data: { detail: { code: "AI_REQUIRES_PREMIUM" } } },
    }),
  );

function renderDashboard({ plan = FREE } = {}) {
  useAuthStore.getState().login("access", { name: "Alice", email: "alice@test.com", plan });
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard, KPIs do mês", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletsApi.list.mockResolvedValue({
      data: [{ id: "w1", name: "Nubank", balance: "27096.50", bank: "nubank" }],
    });
    transactionsApi.list.mockResolvedValue({ data: [], headers: {} });
    goalsApi.list.mockResolvedValue({ data: [] });
    aiApi.getInsight.mockImplementation(recusaIa);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a taxa de poupança mostra quanto da receita sobrou no mês", async () => {
    // 6.200 de receita, 2.914 de despesa: sobram 3.286, 53% da receita.
    dashboardApi.summary.mockResolvedValue(resumo("6200.00", "2914.00"));

    renderDashboard();

    const tile = await screen.findByRole("group", { name: "Taxa de poupança" });
    expect(within(tile).getByText("53%")).toBeInTheDocument();
  });

  it("sem receita no mês, a taxa de poupança não inventa porcentagem", async () => {
    // Gastou 300 sem receber nada: não existe "quanto da receita sobrou".
    dashboardApi.summary.mockResolvedValue(resumo("0.00", "300.00"));

    renderDashboard();

    const tile = await screen.findByRole("group", { name: "Taxa de poupança" });
    expect(within(tile).queryByText(/%/)).not.toBeInTheDocument();
    expect(within(tile).getByText("sem receita no mês")).toBeInTheDocument();
  });

  it("quem gastou mais do que recebeu vê a taxa negativa com o sinal de menos", async () => {
    // 5.000 de receita, 6.000 de despesa: faltaram 1.000, 20% da receita.
    // U+2212, o mesmo menos dos valores em reais (formatBRL).
    dashboardApi.summary.mockResolvedValue(resumo("5000.00", "6000.00"));

    renderDashboard();

    const tile = await screen.findByRole("group", { name: "Taxa de poupança" });
    expect(within(tile).getByText("−20%")).toBeInTheDocument();
  });
});

describe("Dashboard, Score financeiro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletsApi.list.mockResolvedValue({
      data: [{ id: "w1", name: "Nubank", balance: "27096.50", bank: "nubank" }],
    });
    transactionsApi.list.mockResolvedValue({ data: [], headers: {} });
    goalsApi.list.mockResolvedValue({ data: [] });
    dashboardApi.summary.mockResolvedValue(resumo("6200.00", "2914.00"));
  });

  it("premium vê o Score junto do saldo", async () => {
    aiApi.getInsight.mockResolvedValue({
      data: {
        score: 72,
        summary_text: "Você está no caminho certo | Moradia pesa 34% das despesas",
        suggested_action: null,
        error: null,
      },
    });

    renderDashboard({ plan: PREMIUM });

    const saldo = await screen.findByRole("region", { name: "Saldo total" });
    expect(within(saldo).getByText("Score financeiro")).toBeInTheDocument();
    expect(within(saldo).getByText("72")).toBeInTheDocument();
  });

  it("free não vê Score em lugar nenhum da tela", async () => {
    aiApi.getInsight.mockImplementation(recusaIa);

    renderDashboard({ plan: FREE });

    await screen.findByRole("region", { name: "Saldo total" });
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });

  it("premium com a IA fora do ar não vê um Score zerado", async () => {
    // Degradação graciosa do /ai/insight: 200 com score nulo e `error`.
    // Math.round(null) daria 0, um Score que a pessoa não tirou.
    aiApi.getInsight.mockResolvedValue({
      data: { score: null, summary_text: "", suggested_action: null, error: "IA indisponível" },
    });

    renderDashboard({ plan: PREMIUM });

    await screen.findByRole("region", { name: "Saldo total" });
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });
});

describe("Dashboard, onde vai seu dinheiro", () => {
  const lancamento = (id, type, amount, category, description, date) => ({
    id,
    wallet_id: "w1",
    type,
    amount,
    category,
    description,
    date,
    created_at: `${date}T12:00:00Z`,
  });
  const SETEMBRO = [
    lancamento("s1", "INCOME", "9000.00", "Salário", "Salário", "2026-09-01"),
    lancamento("s2", "EXPENSE", "980.00", "Moradia", "Aluguel", "2026-09-05"),
    lancamento("s3", "EXPENSE", "120.00", "Alimentação", "Mercado", "2026-09-10"),
  ];
  const AGOSTO = [lancamento("a1", "EXPENSE", "5000.00", "Compras", "Notebook", "2026-08-20")];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 25, 12));
    walletsApi.list.mockResolvedValue({
      data: [{ id: "w1", name: "Nubank", balance: "7900.00", bank: "nubank" }],
    });
    goalsApi.list.mockResolvedValue({ data: [] });
    aiApi.getInsight.mockImplementation(recusaIa);
    dashboardApi.summary.mockResolvedValue(
      resumo("9000.00", "1100.00", {
        top_categories: [
          { category: "Moradia", total: "980.00" },
          { category: "Alimentação", total: "120.00" },
        ],
      }),
    );
    transactionsApi.list.mockImplementation(({ month } = {}) =>
      Promise.resolve({
        data: month === 9 ? SETEMBRO : month === 8 ? AGOSTO : [],
        headers: {},
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("o maior lançamento é a maior DESPESA do mês corrente", async () => {
    // O salário (9.000, receita) e o notebook (5.000, agosto) são maiores,
    // mas nenhum é despesa deste mês: o certo é o aluguel.
    renderDashboard();

    const maior = (await screen.findByText("Maior lançamento")).parentElement;
    expect(within(maior).getByText("R$ 980,00")).toBeInTheDocument();
    expect(within(maior).getByText("Aluguel")).toBeInTheDocument();
  });
});
