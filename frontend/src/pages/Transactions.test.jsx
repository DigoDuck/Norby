import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { transactionsApi } from "@/api/transactions";
import Transactions from "./Transactions";

vi.mock("@/api/transactions", () => ({
  transactionsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/api/wallets", () => ({
  walletsApi: { list: vi.fn(() => Promise.resolve({ data: [] })) },
}));

function tx(id) {
  return {
    id,
    wallet_id: "w1",
    type: "EXPENSE",
    amount: "10.00",
    category: "Food",
    description: `Item ${id}`,
    date: "2026-06-10",
    created_at: "2026-06-10T00:00:00Z",
  };
}

// prefixo diferente por página deixa os itens distinguíveis no DOM, para
// provar que o render acompanhou a troca de página e não só a chamada à API.
function pagina(qtd, total, prefixo = "") {
  return {
    data: Array.from({ length: qtd }, (_, i) => tx(`${prefixo}${i}`)),
    headers: { "x-total-count": String(total) },
  };
}

describe("Transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pede a primeira página com limit e offset explícitos e renderiza os itens recebidos", async () => {
    // Sem limit explícito o backend aplica 200 e o resto some calado.
    transactionsApi.list.mockResolvedValue(pagina(50, 50, "p1-"));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(transactionsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50, offset: 0 }),
      ),
    );
    // Não basta a API ter sido chamada certo: setTransactions precisa ter
    // de fato colocado a resposta na tela.
    expect((await screen.findAllByText("Item p1-0")).length).toBeGreaterThan(0);
  });

  it("avança de página, busca o offset seguinte e troca a lista renderizada", async () => {
    transactionsApi.list
      .mockResolvedValueOnce(pagina(50, 120, "p1-"))
      .mockResolvedValueOnce(pagina(50, 120, "p2-"));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("Item p1-0")).length).toBeGreaterThan(0);

    const proxima = await screen.findByRole("button", { name: /próxima/i });
    fireEvent.click(proxima);

    await waitFor(() =>
      expect(transactionsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, offset: 50 }),
      ),
    );
    // Prova que o render acompanhou a chamada: item da página 1 some, item
    // da página 2 aparece, e o contador reflete a faixa nova.
    expect((await screen.findAllByText("Item p2-0")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Item p1-0")).not.toBeInTheDocument();
    expect(await screen.findByText(/51.+100.+120/)).toBeInTheDocument();
  });

  it("mostra quantas transações existem no total", async () => {
    transactionsApi.list.mockResolvedValue(pagina(50, 120));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/120/)).toBeInTheDocument();
  });
});
