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

  it("logout clears everything", () => {
    useAuthStore.getState().login("tok123", { name: "Al" });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.isAuthenticated).toBe(false);
  });
});
