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
    fireEvent.change(await screen.findByLabelText("Valor"), { target: { value: "-150.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(-150.5));
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
