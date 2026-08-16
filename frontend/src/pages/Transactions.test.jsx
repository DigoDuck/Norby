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

  it("avisa que a busca cobre só a página atual mesmo quando encontra resultados nela", async () => {
    // Bug real: com 120 transações e busca batendo em 2 na página 1 e mais 9
    // nas páginas seguintes, o usuário via só as 2 e não sabia que faltavam.
    // O aviso não pode depender de filtered.length === 0.
    transactionsApi.list.mockResolvedValue(pagina(50, 120, "p1-"));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item p1-0");
    fireEvent.change(screen.getByLabelText(/buscar transações/i), {
      target: { value: "p1-0" },
    });

    // A busca encontrou resultado (não é o caso de "zero resultados").
    expect(screen.getAllByText("Item p1-0").length).toBeGreaterThan(0);
    expect(
      await screen.findByText(/busca cobre só as transações desta página/i),
    ).toBeInTheDocument();
  });

  it("mantém a paginação utilizável quando a resposta não traz X-Total-Count, contanto que a página venha cheia", async () => {
    // Backend/proxy sem o header: sem isso a página ficava travada em 50 itens
    // sem controles e sem aviso, mesmo tendo mais dados por trás.
    transactionsApi.list.mockResolvedValueOnce({
      data: Array.from({ length: 50 }, (_, i) => tx(`f-${i}`)),
      headers: {},
    });

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item f-0");

    const proxima = await screen.findByRole("button", { name: /próxima/i });
    expect(proxima).toBeEnabled();
    // Sem total conhecido, o contador não pode inventar um "de X".
    expect(screen.getByText("1–50")).toBeInTheDocument();
  });

  it("não mostra faixa invertida quando, sem X-Total-Count, a página seguinte vem vazia", async () => {
    // Heurística do modo fallback: "página veio cheia, habilita Próxima". Com
    // um total que é múltiplo exato de PAGE_SIZE isso é falso positivo — a
    // página seguinte volta vazia e offset+1–offset+0 vira "51–50" ao lado de
    // "Nenhuma transação encontrada".
    transactionsApi.list
      .mockResolvedValueOnce({
        data: Array.from({ length: 50 }, (_, i) => tx(`f-${i}`)),
        headers: {},
      })
      .mockResolvedValueOnce({ data: [], headers: {} });

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item f-0");
    fireEvent.click(await screen.findByRole("button", { name: /próxima/i }));

    await waitFor(() =>
      expect(transactionsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 50 }),
      ),
    );
    await screen.findByText(/nenhuma transação encontrada/i);
    expect(screen.queryByText("51–50")).not.toBeInTheDocument();
  });

  it("preserva a página ao editar uma transação, em vez de voltar para offset 0", async () => {
    // A rodada anterior alegou "cobertura indireta pelos testes de paginação",
    // mas aqueles exercitam o load() disparado por "Próxima", não o disparado
    // pelo submit da edição — call sites diferentes, sem garantia nenhuma.
    transactionsApi.list
      .mockResolvedValueOnce(pagina(50, 120, "p1-"))
      .mockResolvedValueOnce(pagina(50, 120, "p2-"));
    transactionsApi.update.mockResolvedValue({ data: tx("p2-0") });

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item p1-0");
    fireEvent.click(await screen.findByRole("button", { name: /próxima/i }));
    await screen.findAllByText("Item p2-0");

    transactionsApi.list.mockResolvedValueOnce(pagina(50, 120, "p2-"));

    const editButtons = await screen.findAllByRole("button", {
      name: /editar transação/i,
    });
    fireEvent.click(editButtons[0]);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(transactionsApi.update).toHaveBeenCalled());
    await waitFor(() =>
      expect(transactionsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 50 }),
      ),
    );
  });
});
