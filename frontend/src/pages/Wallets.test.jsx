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
});
