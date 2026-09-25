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

  it("keeps the hero ring next to a solid primary CTA", async () => {
    renderDashboard();

    const hero = await screen.findByRole("heading", { name: "Olá, Alice 👋" });
    const section = hero.closest("section");

    expect(screen.getByRole("button", { name: "Falar com a Norby" })).toHaveClass("bg-primary");
    expect(section.querySelector(".hero-ring")).toBeInTheDocument();
  });
});
