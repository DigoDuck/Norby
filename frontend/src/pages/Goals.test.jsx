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

  it("edita nome e valor da meta pelo dialog de edição", async () => {
    goalsApi.update.mockResolvedValue({ data: { ...META, name: "Reserva nova" } });
    renderGoals();

    fireEvent.click(await screen.findByRole("button", { name: /editar meta/i }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(screen.getByLabelText(/nome/i), {
      target: { value: "Reserva nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(goalsApi.update).toHaveBeenCalledWith("1", {
        name: "Reserva nova",
        target_amount: 1000,
      }),
    );
    // O dialog fecha no sucesso; se ficar aberto, o usuário salva duas vezes.
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("não envia campos que o backend ignora na edição", async () => {
    // GoalUpdate aceita só name e target_amount. Mandar type/category dá a
    // impressão de que foram salvos.
    goalsApi.update.mockResolvedValue({ data: META });
    renderGoals();

    fireEvent.click(await screen.findByRole("button", { name: /editar meta/i }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(goalsApi.update).toHaveBeenCalled());
    const [, payload] = goalsApi.update.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(["name", "target_amount"]);
  });
});
