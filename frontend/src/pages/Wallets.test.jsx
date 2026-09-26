import nubankLogo from "@/assets/banks/nubank.svg";
import itauLogo from "@/assets/banks/itau.svg";
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
