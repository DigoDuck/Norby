import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/api/auth";
import App from "./App";

vi.mock("@/api/auth", () => ({
  authApi: {
    // O refreshAccessToken de verdade resolve com o access token cru
    // (string), não com a resposta axios inteira — quem guarda o token no
    // store é a própria função, não quem chama authApi.refresh().
    refresh: vi.fn(() => Promise.resolve("novo")),
    me: vi.fn(() => Promise.resolve({ data: { name: "Alice" } })),
  },
}));
// Este teste cobre routing, não a tela em si: o redirect de sessão válida
// monta o Dashboard de verdade, que dispara chamadas reais de rede (rejeitam
// no jsdom e ficam barulhentas, além de acoplar este teste ao formato de
// resposta da API do Dashboard). Trocamos por um stub.
vi.mock("./pages/Dashboard", () => ({ default: () => <div>Dashboard</div> }));
// AppLayout (que envolve toda rota protegida) roda isso no mount para
// materializar recorrências vencidas; mesma razão do mock acima.
vi.mock("@/api/recurring", () => ({
  recurringApi: { run: vi.fn(() => Promise.resolve({})) },
}));

describe("rota raiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
  });

  it("manda para o dashboard quem já tem sessão", async () => {
    useAuthStore.getState().login("t", { name: "Alice" });

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
  });

  it("mostra a tela de autenticação para quem não tem sessão", async () => {
    render(<App />);

    // "Entrar" aparece em dois botões (alternância de modo e submit); o
    // findByRole verbatim do brief é ambíguo aqui, então checamos presença.
    expect(await screen.findAllByRole("button", { name: /entrar/i })).not.toHaveLength(0);
  });

  it("cai na autenticação sem loop quando o token persistido é inválido", async () => {
    // Simula sessão persistida com o access token adulterado/expirado: o boot
    // chama /auth/refresh (que aqui sucede), depois /auth/me, que rejeita ->
    // logout() -> raiz precisa mostrar Auth uma única vez, sem re-navegar
    // (RootRoute não redireciona quando desloga).
    authApi.me.mockRejectedValueOnce(new Error("401"));
    useAuthStore.getState().login("token-invalido", { name: "Alice" });

    render(<App />);

    expect(await screen.findAllByRole("button", { name: /entrar/i })).not.toHaveLength(0);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(window.location.pathname).toBe("/");
  });

  it("cai na autenticação sem chamar /auth/me quando o cookie de refresh expirou ou não existe", async () => {
    // O boot chama /auth/refresh primeiro. Se ele falha (cookie ausente ou
    // revogado), não há token novo para validar, então /auth/me nem deveria
    // ser chamado.
    authApi.refresh.mockRejectedValueOnce(new Error("401"));
    useAuthStore.getState().login("token-velho", { name: "Alice" });

    render(<App />);

    expect(await screen.findAllByRole("button", { name: /entrar/i })).not.toHaveLength(0);
    expect(authApi.me).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
