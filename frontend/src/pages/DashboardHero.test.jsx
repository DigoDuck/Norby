import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { aiApi } from "@/api/ai";
import { dashboardApi } from "@/api/dashboard";
import { goalsApi } from "@/api/goals";
import { recurringApi } from "@/api/recurring";
import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { useAuthStore } from "@/store/authStore";
import Dashboard from "./Dashboard";

vi.mock("@/api/ai", () => ({ aiApi: { getInsight: vi.fn() } }));
vi.mock("@/api/dashboard", () => ({ dashboardApi: { summary: vi.fn() } }));
vi.mock("@/api/goals", () => ({ goalsApi: { list: vi.fn() } }));
vi.mock("@/api/recurring", () => ({ recurringApi: { run: vi.fn() } }));
vi.mock("@/api/transactions", () => ({ transactionsApi: { list: vi.fn() } }));
vi.mock("@/api/wallets", () => ({ walletsApi: { list: vi.fn() } }));

function renderDashboard() {
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard hero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().login("access", {
      name: "Alice",
      email: "alice@test.com",
    });
    recurringApi.run.mockResolvedValue({});
    walletsApi.list.mockResolvedValue({ data: [] });
    transactionsApi.list.mockResolvedValue({ data: [] });
    dashboardApi.summary.mockResolvedValue({
      data: {
        month_income: 0,
        month_expenses: 0,
        cash_flow: [],
        top_categories: [],
      },
    });
    aiApi.getInsight.mockResolvedValue({ data: null });
    goalsApi.list.mockResolvedValue({ data: [] });
  });

  it("greets the user with a primary CTA to the AI", async () => {
    renderDashboard();

    await screen.findByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite), Alice$/ });

    expect(screen.getByRole("button", { name: "Falar com a Norby" })).toHaveClass("bg-content");
  });
});
