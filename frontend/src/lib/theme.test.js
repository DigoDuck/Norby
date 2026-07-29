import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTheme, setTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cai em dark quando o atributo está ausente", () => {
    expect(getTheme()).toBe("dark");
  });

  it("cai em dark quando o atributo está corrompido", () => {
    document.documentElement.dataset.theme = "banana";
    expect(getTheme()).toBe("dark");
  });

  it("lê light do DOM, não do localStorage", () => {
    localStorage.setItem("norby-theme", "dark");
    document.documentElement.dataset.theme = "light";
    expect(getTheme()).toBe("light");
  });

  it("setTheme aplica no DOM, no color-scheme e persiste", () => {
    expect(setTheme("light")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem("norby-theme")).toBe("light");
  });

  it("setTheme com valor inválido aplica dark", () => {
    expect(setTheme("solarized")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("norby-theme")).toBe("dark");
  });

  it("setTheme aplica no DOM mesmo se o storage estiver bloqueado", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => setTheme("light")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
