import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { authApi } from "@/api/auth";
import EsqueciSenha from "./EsqueciSenha";
import RedefinirSenha from "./RedefinirSenha";

vi.mock("@/api/auth", () => ({
  authApi: { forgotPassword: vi.fn(), resetPassword: vi.fn() },
}));

function renderEm(rota, elemento, caminho) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path={caminho} element={elemento} />
        <Route path="/" element={<p>login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Esqueci a senha", () => {
  it("confirma sem revelar se a conta existe", async () => {
    // O backend responde igual para e-mail conhecido e desconhecido. Se a tela
    // dissesse "enviamos para você", ela desfaria isso: viraria um verificador
    // de quem tem conta no Norby, que é a enumeração que o login evita.
    authApi.forgotPassword.mockResolvedValue({ data: {} });
    renderEm("/esqueci-senha", <EsqueciSenha />, "/esqueci-senha");

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "alguem@test.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar link/i }));

    const texto = await screen.findByText(/se este endereço tiver uma conta/i);
    expect(texto).toBeInTheDocument();
    expect(screen.queryByText(/enviamos para você/i)).not.toBeInTheDocument();
  });

  it("não chama a API com e-mail inválido", async () => {
    renderEm("/esqueci-senha", <EsqueciSenha />, "/esqueci-senha");

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "nao-e-email" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar link/i }));

    expect(await screen.findByText("E-mail inválido")).toBeInTheDocument();
    expect(authApi.forgotPassword).not.toHaveBeenCalled();
  });
});

describe("Redefinir senha", () => {
  it("sem token na URL, não mostra formulário", async () => {
    // Um formulário aqui só levaria a pessoa a digitar uma senha para receber
    // erro no envio. O caminho útil é pedir outro link.
    renderEm("/redefinir-senha", <RedefinirSenha />, "/redefinir-senha");

    expect(screen.getByText(/link incompleto/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pedir um link novo/i })).toHaveAttribute(
      "href",
      "/esqueci-senha",
    );
  });

  it("avisa que as sessões caem, antes de a pessoa salvar", async () => {
    // A troca revoga todo refresh token no servidor. Descobrir isso só depois,
    // ao ser deslogado do celular, parece falha do app.
    renderEm("/redefinir-senha?token=abc123", <RedefinirSenha />, "/redefinir-senha");
    expect(screen.getByText(/todas as sessões abertas/i)).toBeInTheDocument();
  });

  it("recusa senha fraca sem gastar o link", async () => {
    // O link é de uso único: descobrir a regra de senha no servidor queimaria
    // o token e obrigaria a pedir outro e-mail.
    renderEm("/redefinir-senha?token=abc123", <RedefinirSenha />, "/redefinir-senha");

    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "semnumero" } });
    fireEvent.change(screen.getByLabelText("Repita a nova senha"), {
      target: { value: "semnumero" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar nova senha/i }));

    expect(await screen.findByText("Use ao menos uma letra e um número")).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it("recusa quando as duas senhas não conferem", async () => {
    renderEm("/redefinir-senha?token=abc123", <RedefinirSenha />, "/redefinir-senha");

    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senhaboa1" } });
    fireEvent.change(screen.getByLabelText("Repita a nova senha"), {
      target: { value: "senhaboa2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar nova senha/i }));

    expect(await screen.findByText("As senhas não conferem")).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it("envia o token da URL junto da senha nova", async () => {
    authApi.resetPassword.mockResolvedValue({ data: {} });
    renderEm("/redefinir-senha?token=tok-da-url", <RedefinirSenha />, "/redefinir-senha");

    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senhaboa1" } });
    fireEvent.change(screen.getByLabelText("Repita a nova senha"), {
      target: { value: "senhaboa1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar nova senha/i }));

    await waitFor(() => expect(authApi.resetPassword).toHaveBeenCalledWith("tok-da-url", "senhaboa1"));
  });
});
