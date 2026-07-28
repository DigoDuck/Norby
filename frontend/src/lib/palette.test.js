import { describe, expect, it } from "vitest";
import { CHART_SERIES, colorForCategory, hashIndex } from "./palette";
import { EXPENSE_CATEGORIES } from "./categories";

describe("palette", () => {
  it("dá a mesma cor para a mesma categoria, independentemente da ordem", () => {
    const antes = colorForCategory("Alimentação");
    const depois = colorForCategory("Alimentação");
    expect(antes).toBe(depois);
  });

  it("distribui as categorias conhecidas sem colisão entre as 6 primeiras", () => {
    const cores = EXPENSE_CATEGORIES.slice(0, 6).map(colorForCategory);
    expect(new Set(cores).size).toBe(6);
  });

  it("usa o espectro de gráfico tokenizado, nunca hex fixo", () => {
    expect(colorForCategory("Alimentação")).toMatch(/^rgb\(var\(--chart-[1-6]\)\)$/);
    CHART_SERIES.forEach((c) => expect(c).toMatch(/^rgb\(var\(--chart-[1-6]\)\)$/));
  });

  it("categoria desconhecida cai num fallback determinístico", () => {
    const a = colorForCategory("Categoria Histórica Qualquer");
    const b = colorForCategory("Categoria Histórica Qualquer");
    expect(a).toBe(b);
    expect(CHART_SERIES).toContain(a);
  });

  it("normaliza caixa e acento antes de decidir a cor", () => {
    expect(colorForCategory("alimentacao")).toBe(colorForCategory("Alimentação"));
  });

  it("hashIndex fica sempre dentro do intervalo", () => {
    ["", "a", "Contas & Serviços", "x".repeat(200)].forEach((s) => {
      const i = hashIndex(s, 6);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    });
  });
});
