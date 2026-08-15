import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MobileNav from "./MobileNav";

vi.mock("@/api/auth", () => ({ authApi: { logout: vi.fn() } }));
vi.mock("../../api/auth", () => ({ authApi: { logout: vi.fn() } }));

function renderNav() {
  render(
    <MemoryRouter>
      <MobileNav />
    </MemoryRouter>,
  );
}

describe("MobileNav", () => {
  it("abre a gaveta como dialog", async () => {
    // Como div condicional, o Tab continuava percorrendo a página atrás e o
    // foco não voltava ao hambúrguer ao fechar.
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("fecha com Escape", async () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("mantém as rotas e o logout alcançáveis", async () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    await screen.findByRole("dialog");

    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sair/i })).toBeInTheDocument();
  });
});
