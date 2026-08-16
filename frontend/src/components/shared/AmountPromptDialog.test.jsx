import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AmountPromptDialog } from "./AmountPromptDialog";

function open(name = "abrir") {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("AmountPromptDialog", () => {
  it("submits a valid amount (accepts negative) and closes on success", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AmountPromptDialog
        trigger={<button>abrir</button>}
        title="Aporte"
        submitLabel="Adicionar"
        onSubmit={onSubmit}
      />,
    );
    open();
    const input = await screen.findByLabelText("Valor");
    // MoneyInput: digita o valor e depois usa "-" para alternar o sinal
    // (correção de um aporte lançado errado), como no fluxo real do usuário.
    fireEvent.change(input, { target: { value: "150,50" } });
    fireEvent.keyDown(input, { key: "-" });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(-150.5));
  });

  it("selecting 'Correção' by click, with no keyboard event, submits a negative amount", async () => {
    // Teclado virtual: inputMode="numeric" costuma esconder o "-", então o
    // toque no seletor precisa ser o único caminho necessário para o sinal.
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AmountPromptDialog
        trigger={<button>abrir</button>}
        title="Aporte"
        submitLabel="Adicionar"
        onSubmit={onSubmit}
      />,
    );
    open();
    const input = await screen.findByLabelText("Valor");
    fireEvent.change(input, { target: { value: "150,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Correção" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(-150.5));
  });

  it("marks 'Correção' as pressed when the pasted amount is already negative", async () => {
    const onSubmit = vi.fn();
    render(
      <AmountPromptDialog
        trigger={<button>abrir</button>}
        title="Aporte"
        submitLabel="Adicionar"
        onSubmit={onSubmit}
      />,
    );
    open();
    const input = await screen.findByLabelText("Valor");
    fireEvent.change(input, { target: { value: "-150,50" } });
    expect(screen.getByRole("button", { name: "Correção" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Aporte" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("rejects zero without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    render(
      <AmountPromptDialog
        trigger={<button>abrir</button>}
        title="Aporte"
        submitLabel="Adicionar"
        onSubmit={onSubmit}
      />,
    );
    open();
    fireEvent.change(await screen.findByLabelText("Valor"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByText(/diferente de zero/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the API error inline when onSubmit rejects", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue({ response: { data: { detail: "Erro do servidor" } } });
    render(
      <AmountPromptDialog
        trigger={<button>abrir</button>}
        title="Aporte"
        submitLabel="Adicionar"
        onSubmit={onSubmit}
      />,
    );
    open();
    fireEvent.change(await screen.findByLabelText("Valor"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByText("Erro do servidor")).toBeInTheDocument();
  });
});
