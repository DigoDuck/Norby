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
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
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

  it("dá nome acessível a todos os campos da tela", () => {
    // Clicar no rótulo tem que focar o campo, e o leitor de tela precisa
    // anunciar o nome — placeholder some ao digitar e não serve como rótulo.
    renderSettings();

    expect(screen.getByLabelText("Nome completo")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Digite EXCLUIR para confirmar"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Sua senha atual")).toBeInTheDocument();
  });
});

describe("Settings, foto de perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().login("access", "refresh", {
      name: "Alice",
      email: "alice@test.com",
      photo_updated_at: null,
    });
  });

  function escolher(file) {
    fireEvent.change(screen.getByLabelText("Adicionar foto"), {
      target: { files: [file] },
    });
  }

  it("uploads the chosen file and records the new version on the user", async () => {
    accountApi.uploadPhoto.mockResolvedValue({
      data: { photo_updated_at: "2026-09-04T12:00:00Z" },
    });
    renderSettings();

    const file = new File(["x"], "eu.png", { type: "image/png" });
    escolher(file);

    await waitFor(() => expect(accountApi.uploadPhoto).toHaveBeenCalledWith(file));
    // A versão é o que o AppLayout observa para baixar a foto processada.
    await waitFor(() =>
      expect(useAuthStore.getState().user.photo_updated_at).toBe("2026-09-04T12:00:00Z"),
    );
  });

  it("refuses a file over the cap without spending an upload", async () => {
    renderSettings();

    const gigante = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "g.png", {
      type: "image/png",
    });
    escolher(gigante);

    expect(await screen.findByRole("alert")).toHaveTextContent("no máximo 2 MB");
    expect(accountApi.uploadPhoto).not.toHaveBeenCalled();
  });

  it("shows the failure instead of pretending the upload worked", async () => {
    accountApi.uploadPhoto.mockRejectedValue({
      response: { data: { detail: "Formato de imagem não aceito" } },
    });
    renderSettings();

    escolher(new File(["x"], "eu.txt", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Formato de imagem não aceito",
    );
    expect(useAuthStore.getState().user.photo_updated_at).toBeNull();
  });

  it("removes the photo and clears the version", async () => {
    useAuthStore.getState().updateUser({ photo_updated_at: "2026-09-04T12:00:00Z" });
    accountApi.deletePhoto.mockResolvedValue({});
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    await waitFor(() => expect(accountApi.deletePhoto).toHaveBeenCalled());
    await waitFor(() =>
      expect(useAuthStore.getState().user.photo_updated_at).toBeNull(),
    );
  });
});
