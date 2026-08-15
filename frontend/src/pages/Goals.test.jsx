import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { goalsApi } from "@/api/goals";
import Goals from "./Goals";

vi.mock("@/api/goals", () => ({
  goalsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    contribute: vi.fn(),
  },
}));
vi.mock("@/api/ai", () => ({
  aiApi: { getInsight: vi.fn(() => Promise.resolve({ data: null })) },
}));

const META = {
  id: "1",
  name: "Reserva",
  type: "SAVINGS",
  target_amount: "1000.00",
  current_amount: "250.00",
  category: null,
  deadline: null,
  progress_pct: 25,
  remaining: "750.00",
  created_at: "2026-08-01T00:00:00Z",
};

function renderGoals() {
  render(
    <MemoryRouter>
      <Goals />
    </MemoryRouter>,
  );
}

async function abrirEFechar(gatilho) {
  fireEvent.click(gatilho);
  const dialog = await screen.findByRole("dialog");
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}

describe("Goals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Uma meta na lista faz o card tracejado "Criar nova meta" aparecer.
    goalsApi.list.mockResolvedValue({ data: [META] });
  });

  it("devolve o foco ao gatilho que abriu, mesmo alternando entre os dois", async () => {
    // A ref guardava só o card tracejado: depois de abrir por ele uma vez,
    // abrir pelo botão do topo devolvia o foco para o card antigo.
    renderGoals();

    const card = await screen.findByRole("button", { name: /criar nova meta/i });
    // Nome exato: /nova meta/i casaria também com "Criar nova meta" do card.
    const botaoTopo = screen.getByRole("button", { name: "Nova meta" });
    expect(card).not.toBe(botaoTopo);

    await abrirEFechar(card);
    await waitFor(() => expect(card).toHaveFocus());

    await abrirEFechar(botaoTopo);
    await waitFor(() => expect(botaoTopo).toHaveFocus());
  });
});
