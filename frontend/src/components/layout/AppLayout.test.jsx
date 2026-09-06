import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { recurringApi } from "@/api/recurring";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import AppLayout from "./AppLayout";

vi.mock("@/api/recurring", () => ({ recurringApi: { run: vi.fn() } }));
vi.mock("@/api/auth", () => ({ authApi: { me: vi.fn() } }));
vi.mock("@/api/account", () => ({ accountApi: { photo: vi.fn() } }));
vi.mock("./Sidebar", () => ({ default: () => <aside /> }));
vi.mock("./MobileNav", () => ({ default: () => <nav /> }));

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.me.mockResolvedValue({ data: {} });
  });
  afterEach(() => useAuthStore.getState().logout());

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

  it("recarrega o usuário, senão o plano guardado no login nunca envelhece", async () => {
    // O caso concreto: o paywall acende e quem já estava logado passa a levar
    // 403 do backend enquanto a tela, lendo um `plan` velho do localStorage,
    // continua sem oferecer o upgrade. Uma chamada por carga do app resolve.
    recurringApi.run.mockResolvedValue({});
    useAuthStore.getState().login("access", {
      name: "Alice",
      plan: { ai_allowed: true, wallet_cap_applies: false },
    });
    authApi.me.mockResolvedValue({
      data: { name: "Alice", plan: { ai_allowed: false, wallet_cap_applies: true } },
    });

    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(useAuthStore.getState().user.plan.wallet_cap_applies).toBe(true),
    );
  });

  it("não derruba a tela quando o /auth/me falha", async () => {
    recurringApi.run.mockResolvedValue({});
    authApi.me.mockRejectedValue(new Error("rede"));
    const { container } = render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await waitFor(() => expect(authApi.me).toHaveBeenCalled());
    expect(container.querySelector("main")).toBeInTheDocument();
  });
});
