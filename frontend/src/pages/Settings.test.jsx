import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { accountApi } from "@/api/account";
import { authApi } from "@/api/auth";
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

// #156: o Save de e-mail navega pra "/" com um state que o Auth.jsx lê para
// mostrar o aviso — precisa de um spy em `useNavigate` para essa asserção,
// que o MemoryRouter sozinho não dá. `importOriginal` mantém o resto do
// módulo (MemoryRouter, Link) intacto.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigateMock };
});

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
    useAuthStore.getState().login("access", {
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

  it("mapeia 429 na exportação para uma mensagem específica em vez do fallback genérico", async () => {
    // Mesmo motivo do save de perfil: o corpo do 429 do slowapi é
    // {"error": ...}, não {"detail": ...}.
    accountApi.exportData.mockRejectedValue({
      response: { status: 429, data: { error: "rate limited" } },
    });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: /Exportar/ }));

    expect(
      await screen.findByText("Muitas tentativas. Tente de novo mais tarde."),
    ).toBeInTheDocument();
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

describe("Settings, step-up de senha na troca de e-mail (#153)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().login("access", {
      name: "Alice",
      email: "alice@test.com",
    });
  });

  it("só nome não pede senha", async () => {
    authApi.updateProfile.mockResolvedValue({ data: { name: "Nome Novo", email: "alice@test.com" } });
    renderSettings();

    expect(
      screen.queryByLabelText("Senha atual (necessária para trocar o e-mail)"),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nome completo"), {
      target: { value: "Nome Novo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(authApi.updateProfile).toHaveBeenCalledWith({
        name: "Nome Novo",
        email: "alice@test.com",
      }),
    );
  });

  it("corrigir só a CAIXA do próprio e-mail não pede senha", async () => {
    // Fix round 1: o mesmo critério normalizado do backend — só a caixa
    // mudar (alice@test.com -> ALICE@test.com) não é uma troca de fato.
    authApi.updateProfile.mockResolvedValue({
      data: { name: "Alice", email: "ALICE@test.com" },
    });
    renderSettings();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "ALICE@test.com" },
    });

    expect(
      screen.queryByLabelText("Senha atual (necessária para trocar o e-mail)"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(authApi.updateProfile).toHaveBeenCalledWith({
        name: "Alice",
        email: "ALICE@test.com",
      }),
    );
  });

  it("e-mail alterado pede a senha atual e a envia como current_password", async () => {
    authApi.updateProfile.mockResolvedValue({
      data: { name: "Alice", email: "novo@test.com" },
    });
    renderSettings();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "novo@test.com" },
    });

    const senha = screen.getByLabelText("Senha atual (necessária para trocar o e-mail)");
    fireEvent.change(senha, { target: { value: "secret123" } });

    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() =>
      expect(authApi.updateProfile).toHaveBeenCalledWith({
        name: "Alice",
        email: "novo@test.com",
        current_password: "secret123",
      }),
    );
  });

  it("e-mail alterado com sucesso desloga e leva à tela de entrada com o aviso, sem tocar o store (#156)", async () => {
    // A troca sobe o token_epoch no servidor e mata o access token desta aba
    // na hora. Em vez de mostrar algo aqui (que morreria junto quando a
    // sessão cair), o mesmo padrão de RedefinirSenha.jsx -> Auth.jsx: desloga
    // e manda o state que o Auth.jsx lê para mostrar o aviso.
    authApi.updateProfile.mockResolvedValue({
      data: { name: "Alice", email: "novo@test.com" },
    });
    authApi.logout.mockResolvedValue(undefined);
    const updateUserSpy = vi.spyOn(useAuthStore.getState(), "updateUser");
    renderSettings();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "novo@test.com" },
    });
    fireEvent.change(
      screen.getByLabelText("Senha atual (necessária para trocar o e-mail)"),
      { target: { value: "secret123" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(authApi.logout).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/", {
      replace: true,
      state: { emailAlterado: true },
    });
    // O token já está morto no servidor e o logout acima vai limpar o store
    // inteiro: atualizar o e-mail aqui só para apagá-lo em seguida não serve
    // a ninguém.
    expect(updateUserSpy).not.toHaveBeenCalled();
  });

  it("mostra 'Senha incorreta.' e associa o erro ao campo quando o backend recusa a senha do step-up", async () => {
    authApi.updateProfile.mockRejectedValue({ response: { status: 401 } });
    renderSettings();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "novo@test.com" },
    });
    const senha = screen.getByLabelText("Senha atual (necessária para trocar o e-mail)");
    fireEvent.change(senha, { target: { value: "errada" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Senha incorreta.");
    // O campo aponta para o próprio erro: leitor de tela lê os dois juntos ao
    // focar, em vez de só ouvir "inválido" sem saber por quê.
    expect(senha).toHaveAttribute("aria-invalid", "true");
    expect(senha).toHaveAttribute("aria-describedby", alerta.id);
  });

  it("mapeia 429 para uma mensagem específica em vez do fallback genérico do apiErrorMessage", async () => {
    // O corpo do 429 do slowapi é {"error": ...}, não {"detail": ...}:
    // apiErrorMessage não acha nada ali e cairia no fallback genérico sem
    // este mapeamento explícito.
    authApi.updateProfile.mockRejectedValue({
      response: { status: 429, data: { error: "rate limited" } },
    });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Muitas tentativas. Tente de novo mais tarde.",
    );
  });
});

describe("Settings, foto de perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().login("access", {
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
