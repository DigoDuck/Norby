import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { recurringApi } from "@/api/recurring";
import AppLayout from "./AppLayout";

vi.mock("@/api/recurring", () => ({ recurringApi: { run: vi.fn() } }));
vi.mock("./Sidebar", () => ({ default: () => <aside /> }));
vi.mock("./MobileNav", () => ({ default: () => <nav /> }));

describe("AppLayout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("materializa recorrências ao entrar na área autenticada", async () => {
    // Regressão: com a chamada só no boot do App (deps vazias), um login feito
    // DENTRO da SPA não remontava o App e as recorrências vencidas ficavam
    // pendentes até um reload. O AppLayout monta nos dois caminhos.
    recurringApi.run.mockResolvedValue({});
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await waitFor(() => expect(recurringApi.run).toHaveBeenCalledTimes(1));
  });

  it("não derruba a tela quando a materialização falha", async () => {
    // O painel inteiro não pode sumir porque /recurring/run deu erro.
    recurringApi.run.mockRejectedValue(new Error("500"));
    const { container } = render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await waitFor(() => expect(recurringApi.run).toHaveBeenCalled());
    expect(container.querySelector("main")).toBeInTheDocument();
  });
});
