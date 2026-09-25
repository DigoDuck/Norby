import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./authStore";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it("starts unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("login sets token, user and flag", () => {
    useAuthStore.getState().login("tok123", { name: "Al" });
    const s = useAuthStore.getState();
    expect(s.token).toBe("tok123");
    expect(s.user.name).toBe("Al");
    expect(s.isAuthenticated).toBe(true);
  });

  it("setToken rotates the access token, keeping the user", () => {
    useAuthStore.getState().login("tok123", { name: "Al" });
    useAuthStore.getState().setToken("tok456");
    const s = useAuthStore.getState();
    expect(s.token).toBe("tok456");
    expect(s.user.name).toBe("Al");
  });

  it("never persists the access token", () => {
    // #110: o token vive em memória. O access token novo vem do
    // /auth/refresh com o cookie.
    useAuthStore.getState().login("tok123", { name: "Al" });
    const persistido = JSON.parse(localStorage.getItem("norby-auth")).state;
    expect(persistido).not.toHaveProperty("token");
    expect(persistido).not.toHaveProperty("refreshToken");
    expect(persistido.isAuthenticated).toBe(true);
  });

  it("persists only the session flag, no personal data", () => {
    // Nome, e-mail e a foto de rosto ficavam no localStorage sem prazo: num
    // computador compartilhado, até alguém abrir o Norby de novo. O boot já
    // busca /auth/me antes de mostrar qualquer tela, então guardar o usuário
    // não poupava requisição nenhuma — só deixava o dado lá.
    useAuthStore.getState().login("tok123", { name: "Al", email: "al@test.com" });
    useAuthStore.getState().setPhoto("data:image/webp;base64,AAAA", "2026-09-25");
    const persistido = JSON.parse(localStorage.getItem("norby-auth")).state;
    expect(persistido).toEqual({ isAuthenticated: true });
  });

  it("drops personal data left by the previous storage format", async () => {
    // Navegadores de quem já usa o app guardam o formato antigo (versão 0,
    // com usuário e foto). A migração não pode trazê-los de volta à memória.
    localStorage.setItem(
      "norby-auth",
      JSON.stringify({
        state: {
          user: { name: "Al", email: "al@test.com" },
          isAuthenticated: true,
          photo: "data:image/webp;base64,AAAA",
          photoFor: "2026-09-25",
        },
        version: 0,
      }),
    );
    await useAuthStore.persist.rehydrate();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.user).toBeNull();
    expect(s.photo).toBeNull();
  });

  it("logout clears everything", () => {
    useAuthStore.getState().login("tok123", { name: "Al" });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });
});
