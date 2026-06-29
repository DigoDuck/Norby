import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./authStore";

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it("starts unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("login sets tokens, user and flag", () => {
    useAuthStore.getState().login("tok123", "ref123", { name: "Al" });
    const s = useAuthStore.getState();
    expect(s.token).toBe("tok123");
    expect(s.refreshToken).toBe("ref123");
    expect(s.user.name).toBe("Al");
    expect(s.isAuthenticated).toBe(true);
  });

  it("setTokens rotates the token pair, keeping the user", () => {
    useAuthStore.getState().login("tok123", "ref123", { name: "Al" });
    useAuthStore.getState().setTokens("tok456", "ref456");
    const s = useAuthStore.getState();
    expect(s.token).toBe("tok456");
    expect(s.refreshToken).toBe("ref456");
    expect(s.user.name).toBe("Al");
  });

  it("logout clears everything", () => {
    useAuthStore.getState().login("tok123", "ref123", { name: "Al" });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });
});
