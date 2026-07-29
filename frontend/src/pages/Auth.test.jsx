import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

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
});
