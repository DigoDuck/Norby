import nubankLogo from "@/assets/banks/nubank.svg";
import itauLogo from "@/assets/banks/itau.svg";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { walletsApi } from "@/api/wallets";
import { transactionsApi } from "@/api/transactions";
import Wallets from "./Wallets";

vi.mock("@/api/transactions", () => ({ transactionsApi: { summary: vi.fn() } }));

vi.mock("@/api/wallets", () => ({
  walletsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("Wallets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletsApi.list.mockResolvedValue({ data: [] });
  });

  it("associa os rótulos aos campos do formulário", async () => {
    // Clicar no rótulo tem que focar o campo; placeholder some ao digitar e
    // não serve como nome acessível.
    render(<Wallets />);
    fireEvent.click(await screen.findByRole("button", { name: /nova carteira/i }));

    expect(await screen.findByLabelText("Nome da carteira")).toBeInTheDocument();
    expect(screen.getByLabelText("Saldo inicial")).toBeInTheDocument();
  });

  it("devolve o foco ao gatilho quando o diálogo fecha", async () => {
    // O Dialog é controlado por estado, sem DialogTrigger: sem finalFocus o
    // usuário de teclado cairia no body ao fechar.
    render(<Wallets />);
    const gatilho = await screen.findByRole("button", { name: /nova carteira/i });
    fireEvent.click(gatilho);

    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(gatilho).toHaveFocus());
  });

  it("não envia carteira sem nome", async () => {
    render(<Wallets />);
    fireEvent.click(await screen.findByRole("button", { name: /nova carteira/i }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: /criar carteira/i }));

    expect(await screen.findByText("Informe um nome.")).toBeInTheDocument();
    expect(walletsApi.create).not.toHaveBeenCalled();
  });

  it("mostra o logo do banco, e a inicial quando não há banco", async () => {
    walletsApi.list.mockResolvedValue({
      data: [
        { id: "1", name: "Conta principal", balance: "10.00", bank: "nubank" },
        { id: "2", name: "Poupança", balance: "20.00", bank: null },
      ],
    });
    const { container } = render(<Wallets />);

    // Com banco, o logo vence o nome: "Conta principal" mostraria "C".
    await screen.findByText("Poupança");
    const logos = [...container.querySelectorAll("img")];
    expect(logos).toHaveLength(1);
    expect(logos[0].getAttribute("src")).toBe(nubankLogo);
    // Sem banco, nada muda em relação ao que já existia.
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("carteira sem banco escolhido, mas com o nome de um banco, mostra o logo dele", async () => {
    // Carteira criada antes do campo Banco: o nome já diz o banco, e mostrar
    // a inicial "N" escondia o logo sem a pessoa saber que tinha de editar.
    walletsApi.list.mockResolvedValue({
      data: [{ id: "1", name: "Nubank", balance: "102.69", bank: null }],
    });
    const { container } = render(<Wallets />);

    await screen.findAllByText("Nubank");
    const logos = [...container.querySelectorAll("img")];
    expect(logos).toHaveLength(1);
    expect(logos[0].getAttribute("src")).toBe(nubankLogo);
  });

  it("o nome vale mesmo digitado sem acento, em minúsculas ou com espaço sobrando", async () => {
    walletsApi.list.mockResolvedValue({
      data: [{ id: "1", name: "itau ", balance: "5.00", bank: null }],
    });
    const { container } = render(<Wallets />);

    await screen.findAllByText(/itau/);
    const logos = [...container.querySelectorAll("img")];
    expect(logos).toHaveLength(1);
    expect(logos[0].getAttribute("src")).toBe(itauLogo);
  });

  it("editar essa carteira já traz o banco que ela mostra, e salvar grava", async () => {
    // O card mostra o logo do Nubank; o campo Banco dizendo "Sem banco" seria
    // o formulário discordando da tela. Salvar sem mexer passa a gravar.
    walletsApi.list.mockResolvedValue({
      data: [{ id: "w9", name: "Nubank", balance: "102.69", bank: null }],
    });
    walletsApi.update.mockResolvedValue({ data: {} });
    render(<Wallets />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar carteira" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(walletsApi.update).toHaveBeenCalledWith("w9", expect.objectContaining({ bank: "nubank" })),
    );
  });

  it("carteiras do mesmo banco mostram o mesmo logo, com nomes diferentes", async () => {
    // É esse o ganho de escolher um banco: reconhecer de relance.
    walletsApi.list.mockResolvedValue({
      data: [
        { id: "1", name: "Conta principal", balance: "1.00", bank: "itau" },
        { id: "2", name: "Reserva de emergência", balance: "2.00", bank: "itau" },
      ],
    });
    const { container } = render(<Wallets />);
    await screen.findByText("Reserva de emergência");

    const srcs = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs).toHaveLength(2);
    expect(srcs[0]).toBe(itauLogo);
    expect(srcs[0]).toBe(srcs[1]);
  });

  it("omite `bank` quando nenhum banco foi escolhido", async () => {
    // O backend valida o slug com `min_length=1` e um pattern, então mandar
    // `bank: ""` seria 422. Omitir é o que faz "sem banco" funcionar.
    walletsApi.create.mockResolvedValue({ data: {} });
    render(<Wallets />);
    fireEvent.click(await screen.findByRole("button", { name: /nova carteira/i }));
    await screen.findByRole("dialog");

    fireEvent.change(await screen.findByLabelText("Nome da carteira"), {
      target: { value: "Carteira" },
    });
    fireEvent.click(screen.getByRole("button", { name: /criar carteira/i }));

    await waitFor(() => expect(walletsApi.create).toHaveBeenCalled());
    expect(walletsApi.create.mock.calls[0][0]).not.toHaveProperty("bank");
  });
});

describe("Wallets, excluir carteira", () => {
  const NUBANK = {
    id: "w1",
    name: "Nubank",
    balance: "1840.50",
    bank: "nubank",
    created_at: "2026-06-01T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    walletsApi.list.mockResolvedValue({ data: [NUBANK] });
  });

  it("antes de excluir, diz quantos lançamentos e qual saldo vão junto", async () => {
    // "Todas as transações dela serão excluídas" não dizia quanto: 3 ou 300.
    transactionsApi.summary.mockResolvedValue({
      data: { count: 12, income: "3000.00", expenses: "1159.50" },
    });
    render(<Wallets />);

    // O gatilho do Base UI só responde depois dos efeitos passivos.
    fireEvent.click(await screen.findByRole("button", { name: "Excluir carteira", expanded: false }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/12 lançamentos/)).toBeInTheDocument();
    expect(within(dialog).getByText(/R\$ 1\.840,50/)).toBeInTheDocument();
    expect(within(dialog).getByText(/não dá para desfazer/i)).toBeInTheDocument();
    expect(transactionsApi.summary).toHaveBeenCalledWith({ wallet_id: "w1" });
  });
  it("sem a contagem, o aviso continua, sem inventar número", async () => {
    transactionsApi.summary.mockRejectedValue(new Error("500"));
    render(<Wallets />);

    fireEvent.click(await screen.findByRole("button", { name: "Excluir carteira", expanded: false }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(transactionsApi.summary).toHaveBeenCalled());
    expect(within(dialog).getByText(/os lançamentos dela/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/\d+ lançamentos?/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/não dá para desfazer/i)).toBeInTheDocument();
  });
});
