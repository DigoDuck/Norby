import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import Transactions from "./Transactions";

vi.mock("@/api/transactions", () => ({
  transactionsApi: {
    list: vi.fn(),
    // Resposta padrão de /transactions/summary: os testes que não são sobre
    // os totais não precisam pensar neles.
    summary: vi.fn(() => Promise.resolve({ data: { count: 0, income: "0.00", expenses: "0.00" } })),
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

  afterEach(() => {
    vi.useRealTimers();
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

  // Timeout aumentado para 15s: este teste renderiza 50 linhas mockadas e encadeia
  // múltiplos waitFor; sob disputa de CPU na execução da suíte completa passa dos 5s padrão.
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
  }, 15000);

  it("mostra quantas transações existem no total", async () => {
    transactionsApi.list.mockResolvedValue(pagina(50, 120));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/120/)).toBeInTheDocument();
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

  it("busca consulta o servidor depois da espera", async () => {
    transactionsApi.list.mockResolvedValue(pagina(50, 50, "p1-"));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item p1-0");
    transactionsApi.list.mockClear();
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText(/buscar transações/i), {
      target: { value: "feira" },
    });

    // Antes de a espera terminar, nenhuma chamada nova.
    expect(transactionsApi.list).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(transactionsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ q: "feira" }),
    );
  });

  it("busca curta não consulta", async () => {
    transactionsApi.list.mockResolvedValue(pagina(50, 50, "p1-"));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item p1-0");
    transactionsApi.list.mockClear();
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText(/buscar transações/i), {
      target: { value: "f" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(transactionsApi.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ q: expect.anything() }),
    );
  });

  it("a busca sobrevive à paginação: 'Próxima' carrega com o termo ativo", async () => {
    transactionsApi.list
      .mockResolvedValueOnce(pagina(50, 50, "p1-")) // mount
      .mockResolvedValueOnce(pagina(50, 120, "busca-")) // resultado da busca
      .mockResolvedValueOnce(pagina(50, 120, "busca2-")); // após "Próxima"

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item p1-0");
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText(/buscar transações/i), {
      target: { value: "mercado" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getAllByText("Item busca-0").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /próxima/i }));

    expect(transactionsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "mercado", offset: 50 }),
    );
  });

  it("anuncia no role=status quando a busca não encontra nada", async () => {
    transactionsApi.list
      .mockResolvedValueOnce(pagina(50, 50, "p1-")) // mount
      .mockResolvedValueOnce({ data: [], headers: { "x-total-count": "0" } }); // busca vazia

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item p1-0");
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText(/buscar transações/i), {
      target: { value: "xyznaoexiste" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Nenhuma transação encontrada para essa busca.",
    );
  });

  it("não anuncia contagem da busca anterior enquanto a pessoa ainda digita", async () => {
    // O debounce faz existir uma janela em que o texto digitado já tem 2
    // caracteres mas a lista na tela ainda é a de antes. Derivar o anúncio do
    // que está sendo digitado faria o leitor de tela ler "50 transações
    // encontradas" — a contagem da lista SEM filtro — assim que o segundo
    // caractere aparecesse.
    transactionsApi.list.mockResolvedValue(pagina(50, 50, "p1-"));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item p1-0");
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText(/buscar transações/i), {
      target: { value: "me" },
    });
    // Sem avançar o tempo: a busca ainda não saiu.
    expect(screen.getByRole("status")).not.toHaveTextContent(/encontrad/i);
  });

  it("anuncia no role=status a contagem quando a busca encontra resultados", async () => {
    transactionsApi.list
      .mockResolvedValueOnce(pagina(50, 50, "p1-")) // mount
      .mockResolvedValueOnce(pagina(7, 7, "busca-")); // busca com 7 resultados

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    await screen.findAllByText("Item p1-0");
    vi.useFakeTimers();

    fireEvent.change(screen.getByLabelText(/buscar transações/i), {
      target: { value: "mercado" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByRole("status")).toHaveTextContent("7 transações encontradas");
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

  // Timeout aumentado para 15s: este teste renderiza 50 linhas mockadas, navega entre páginas
  // e dispara um diálogo de edição; encadeia múltiplos waitFor; sob disputa de CPU passa dos 5s padrão.
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
  }, 15000);
});

// Só o relógio é falso: timers reais, porque o Select abre com animação.
function hojeE(data) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(data);
}

// Como a pessoa faz: abre, passa o mouse, clica. O Base UI só aceita o clique
// numa opção destacada, e quem destaca é o hover.
async function escolherMes(nome) {
  fireEvent.click(screen.getByRole("combobox", { name: "Mês" }));
  const opcao = await screen.findByRole("option", { name: nome });
  fireEvent.mouseMove(opcao);
  fireEvent.click(opcao);
}

describe("Transactions, filtro por mês", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionsApi.list.mockResolvedValue(pagina(3, 3, "m-"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("escolher um mês pede só aquele mês, inclusive o do ano anterior", async () => {
    // Em janeiro, o mês anterior é dezembro do ANO anterior: um cálculo que
    // só subtrai o mês pediria o mês 0, ou dezembro do ano corrente.
    hojeE(new Date(2026, 0, 15, 12));
    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );
    await screen.findAllByText("Item m-0");

    await escolherMes("Dezembro de 2025");

    await waitFor(() =>
      expect(transactionsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ month: 12, year: 2025, offset: 0 }),
      ),
    );
  });

  it("a busca que ainda estava esperando não desfaz o mês escolhido nesse meio-tempo", async () => {
    // A busca espera 300ms. Se o mês muda dentro da espera, a busca atrasada
    // não pode sair com o mês de antes: a lista voltaria a ser de todos os
    // meses com o seletor ainda mostrando agosto.
    hojeE(new Date(2026, 8, 25, 12));
    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );
    await screen.findAllByText("Item m-0");

    fireEvent.change(screen.getByLabelText(/buscar transações/i), {
      target: { value: "mercado" },
    });
    await escolherMes("Agosto de 2026");
    await act(() => new Promise((r) => setTimeout(r, 400)));

    expect(transactionsApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "mercado", month: 8, year: 2026 }),
    );
  });
  it("a paginação continua no mês escolhido", async () => {
    hojeE(new Date(2026, 8, 25, 12));
    transactionsApi.list.mockResolvedValue(pagina(50, 120, "m-"));
    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );
    await screen.findAllByText("Item m-0");

    await escolherMes("Agosto de 2026");
    fireEvent.click(await screen.findByRole("button", { name: /próxima/i }));

    await waitFor(() =>
      expect(transactionsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ month: 8, year: 2026, offset: 50 }),
      ),
    );
  });

  it("voltar para 'Todos os meses' pede o histórico inteiro de novo", async () => {
    hojeE(new Date(2026, 8, 25, 12));
    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );
    await screen.findAllByText("Item m-0");

    await escolherMes("Agosto de 2026");
    await escolherMes("Todos os meses");

    await waitFor(() => {
      const ultima = transactionsApi.list.mock.lastCall[0];
      expect(ultima).not.toHaveProperty("month");
      expect(ultima).not.toHaveProperty("year");
    });
  });
});

describe("Transactions, busca vinda da URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionsApi.list.mockResolvedValue(pagina(3, 3, "q-"));
  });

  it("abrir o Extrato com ?q= já pede a primeira página com o termo e mostra o termo no campo", async () => {
    // É o destino da busca do Dashboard. A primeira requisição já vem
    // filtrada: pedir a lista inteira antes gastava uma ida ao servidor à toa.
    render(
      <MemoryRouter initialEntries={["/transactions?q=mercado"]}>
        <Transactions />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(transactionsApi.list).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ q: "mercado", offset: 0 }),
      ),
    );
    expect(screen.getByLabelText(/buscar transações/i)).toHaveValue("mercado");
  });
});

describe("Transactions, totais do período", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionsApi.list.mockResolvedValue(pagina(3, 3, "t-"));
  });

  it("mostra quanto entrou, quanto saiu e o resultado do que está filtrado", async () => {
    // 1.000 de entrada e 200 de saída: resultado de 800.
    transactionsApi.summary.mockResolvedValue({
      data: { count: 3, income: "1000.00", expenses: "200.00" },
    });

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    const totais = await screen.findByRole("region", { name: "Totais do período" });
    expect(within(totais).getByText("+R$ 1.000,00")).toBeInTheDocument();
    expect(within(totais).getByText("−R$ 200,00")).toBeInTheDocument();
    expect(within(totais).getByText("R$ 800,00")).toBeInTheDocument();
  });
  it("cada linha diz de qual carteira é o lançamento", async () => {
    // Com duas carteiras, "−R$ 10,00 · Food" sem a carteira não diz de onde saiu.
    walletsApi.list.mockResolvedValueOnce({
      data: [{ id: "w1", name: "Nubank", balance: "10.00", bank: "nubank", created_at: "2026-06-01T00:00:00Z" }],
    });

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    const tabela = await screen.findByRole("table");
    expect(within(tabela).getByRole("columnheader", { name: "Carteira" })).toBeInTheDocument();
    expect((await within(tabela).findAllByText("Nubank")).length).toBe(3);
  });
  it("os totais seguem o mês escolhido, não a página nem o histórico inteiro", async () => {
    hojeE(new Date(2026, 8, 25, 12));
    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );
    await screen.findAllByText("Item t-0");

    await escolherMes("Agosto de 2026");

    await waitFor(() =>
      expect(transactionsApi.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ month: 8, year: 2026 }),
      ),
    );
  });

  it("se os totais falharem, somem sem esconder a lista", async () => {
    // Total desconhecido não vira R$ 0,00 (DESIGN.md, No Invented Number).
    transactionsApi.summary.mockRejectedValueOnce(new Error("500"));

    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("Item t-0")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "Totais do período" })).not.toBeInTheDocument();
  });
});
