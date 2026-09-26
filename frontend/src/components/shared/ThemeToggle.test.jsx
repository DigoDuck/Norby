import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle, { ThemeButton } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "dark";
  });

  it("marca o tema atual como selecionado", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: /escuro/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /claro/i })).not.toBeChecked();
  });

  it("aplica e persiste o tema claro ao selecionar", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("radio", { name: /claro/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("norby-theme")).toBe("light");
    expect(screen.getByRole("radio", { name: /claro/i })).toBeChecked();
  });

  it("volta para o escuro sem recarregar", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("radio", { name: /claro/i }));
    fireEvent.click(screen.getByRole("radio", { name: /escuro/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("norby-theme")).toBe("dark");
  });
});

describe("ThemeButton", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "dark";
  });

  it("troca o tema, grava a escolha e o nome passa a dizer a próxima troca", () => {
    // Botão só de ícone: o nome acessível é a única pista do que o clique faz.
    render(<ThemeButton />);

    fireEvent.click(screen.getByRole("button", { name: "Usar tema claro" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("norby-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Usar tema escuro" })).toBeInTheDocument();
  });
});
