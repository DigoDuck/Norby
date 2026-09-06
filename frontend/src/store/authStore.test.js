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
    // #110: o token vive em memória. O que sobrevive à recarga é o usuário e
    // a flag; o access token novo vem do /auth/refresh com o cookie.
    useAuthStore.getState().login("tok123", { name: "Al" });
    const persistido = JSON.parse(localStorage.getItem("norby-auth")).state;
    expect(persistido).not.toHaveProperty("token");
    expect(persistido).not.toHaveProperty("refreshToken");
    expect(persistido.isAuthenticated).toBe(true);
  });

  it("logout clears everything", () => {
    useAuthStore.getState().login("tok123", { name: "Al" });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });
});
