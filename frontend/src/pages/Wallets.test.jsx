import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { walletsApi } from "@/api/wallets";
import Wallets from "./Wallets";

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

  it("mostra a marca do banco no chip, e a inicial quando não há banco", async () => {
    walletsApi.list.mockResolvedValue({
      data: [
        { id: "1", name: "Conta principal", balance: "10.00", bank: "nubank" },
        { id: "2", name: "Poupança", balance: "20.00", bank: null },
      ],
    });
    render(<Wallets />);

    // Com banco, a marca vence o nome: "Conta principal" mostraria "C".
    expect(await screen.findByText("Nu")).toBeInTheDocument();
    // Sem banco, nada muda em relação ao que já existia.
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("agrupa a cor pelo banco, não pelo nome", async () => {
    // Duas carteiras do mesmo banco com nomes DIFERENTES têm de ficar com o
    // mesmo chip. É esse o ganho de escolher um banco: reconhecer de relance.
    //
    // Não se afirma aqui que bancos diferentes têm cores diferentes, e a
    // primeira versão deste teste afirmava: são 11 bancos para 9 cores na
    // paleta, então colisão é garantida por casa dos pombos. A cor agrupa,
    // não identifica — quem identifica é a marca de duas letras.
    walletsApi.list.mockResolvedValue({
      data: [
        { id: "1", name: "Conta principal", balance: "1.00", bank: "itau" },
        { id: "2", name: "Reserva de emergência", balance: "2.00", bank: "itau" },
      ],
    });
    const { container } = render(<Wallets />);
    await screen.findAllByText("It");

    const cores = [...container.querySelectorAll("[style*='color-mix']")].map(
      (el) => el.style.color,
    );
    expect(cores).toHaveLength(2);
    expect(cores[0]).toBe(cores[1]);
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
