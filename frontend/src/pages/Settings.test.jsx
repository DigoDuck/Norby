import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { accountApi } from "@/api/account";
import { useAuthStore } from "@/store/authStore";
import Settings from "./Settings";

vi.mock("@/api/account", () => ({
  accountApi: {
    deleteAccount: vi.fn(),
    exportData: vi.fn(),
  },
}));

vi.mock("@/api/auth", () => ({
  authApi: {
    logout: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

function renderSettings() {
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

function fillDeleteConfirmation(password = "secret123") {
  fireEvent.change(screen.getByPlaceholderText("Digite EXCLUIR para confirmar"), {
    target: { value: "EXCLUIR" },
  });
  fireEvent.change(screen.getByPlaceholderText("Sua senha atual"), {
    target: { value: password },
  });
}

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().login("access", "refresh", {
      name: "Alice",
      email: "alice@test.com",
    });
  });

  it("exige e envia a senha atual ao excluir a conta", async () => {
    accountApi.deleteAccount.mockResolvedValue({ status: 204 });
    renderSettings();

    const button = screen.getByRole("button", {
      name: "Excluir minha conta permanentemente",
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Digite EXCLUIR para confirmar"), {
      target: { value: "EXCLUIR" },
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Sua senha atual"), {
      target: { value: "secret123" },
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() =>
      expect(accountApi.deleteAccount).toHaveBeenCalledWith("secret123"),
    );
  });

  it("mostra uma mensagem específica quando a senha está incorreta", async () => {
    accountApi.deleteAccount.mockRejectedValue({ response: { status: 401 } });
    renderSettings();
    fillDeleteConfirmation("senhaerrada1");

    fireEvent.click(
      screen.getByRole("button", { name: "Excluir minha conta permanentemente" }),
    );

    expect(await screen.findByText("Senha incorreta.")).toBeInTheDocument();
  });
});
