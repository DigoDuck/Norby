import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("opens from the trigger, confirms, and closes on success", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfirmDialog
        trigger={<button>abrir</button>}
        title="Remover esta meta?"
        confirmLabel="Remover"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText("Remover esta meta?")).not.toBeInTheDocument(),
    );
  });

  it("shows the API error inline and stays open when onConfirm rejects", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValue({ response: { data: { detail: "Falhou no servidor" } } });
    render(
      <ConfirmDialog
        trigger={<button>abrir</button>}
        title="Remover?"
        confirmLabel="Remover"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover" }));

    expect(await screen.findByText("Falhou no servidor")).toBeInTheDocument();
    // Continua aberto (o título segue visível).
    expect(screen.getByText("Remover?")).toBeInTheDocument();
  });
});
