import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import Auth from "./Auth";

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

describe("Auth", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it("mantém rótulos acessíveis e associa os erros aos campos inválidos", async () => {
    const { container } = renderAuth();

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Senha");

    fireEvent.click(container.querySelector('button[type="submit"]'));

    const emailError = await screen.findByText("Email inválido");
    const passwordError = await screen.findByText("Mínimo de 8 caracteres");

    await waitFor(() => {
      expect(email).toHaveAttribute("aria-invalid", "true");
      expect(password).toHaveAttribute("aria-invalid", "true");
    });
    expect(email).toHaveAttribute("aria-describedby", emailError.id);
    expect(password).toHaveAttribute("aria-describedby", passwordError.id);
  });

  it("alterna entrada e cadastro como botões pressionáveis sem simular tabs", () => {
    renderAuth();

    const enterMode = screen
      .getAllByRole("button", { name: "Entrar" })
      .find((button) => button.type === "button");
    const registerMode = screen.getByRole("button", { name: "Cadastrar" });

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(enterMode).toHaveAttribute("aria-pressed", "true");
    expect(registerMode).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(registerMode);

    expect(enterMode).toHaveAttribute("aria-pressed", "false");
    expect(registerMode).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Seu nome")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar senha")).toBeInTheDocument();
  });

  it("rejeita no cadastro uma senha acima de 72 bytes", async () => {
    const registerSpy = vi.spyOn(authApi, "register").mockRejectedValue({
      response: { status: 400, data: { detail: "não deveria enviar" } },
    });
    renderAuth();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    const senhaLonga = `${"A".repeat(72)}1`;
    fireEvent.change(screen.getByLabelText("Seu nome"), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: senhaLonga },
    });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), {
      target: { value: senhaLonga },
    });
    fireEvent.click(screen.getByLabelText(/Li e aceito os/));
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(
      await screen.findByText(
        "A senha deve ter no máximo 72 bytes (acentos contam 2)",
      ),
    ).toBeInTheDocument();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it("leva à recuperação de senha, que deixou de ser 'em breve'", () => {
    // Este link já foi um botão desabilitado com um chip "em breve", porque a
    // rota não existia. Com o #36 ela existe, e um rótulo de estado que não
    // corresponde mais ao estado é pior que rótulo nenhum.
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /esqueceu a senha/i });
    expect(link).toHaveAttribute("href", "/esqueci-senha");
    expect(screen.queryByText("em breve")).not.toBeInTheDocument();
  });
});
