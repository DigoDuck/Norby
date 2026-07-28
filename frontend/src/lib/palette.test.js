import { describe, expect, it } from "vitest";
import { CHART_SERIES, colorForCategory, hashIndex } from "./palette";
import { EXPENSE_CATEGORIES } from "./categories";

describe("palette", () => {
  it("dá a mesma cor para a mesma categoria, independentemente da ordem", () => {
    const antes = colorForCategory("Alimentação");
    const depois = colorForCategory("Alimentação");
    expect(antes).toBe(depois);
  });

  // O donut mostra o top-5 de despesas do mês, e o top-5 muda de mês para mês.
  // Como a cor precisa ser estável por categoria, qualquer par de despesas pode
  // acabar na mesma rosca: TODAS as 9 têm que ser distintas, não só as 6
  // primeiras. A versão fraca deste teste deixou passar Moradia e
  // "Contas & Serviços" com a mesma cor.
  it("dá uma cor distinta a cada categoria de despesa", () => {
    const cores = EXPENSE_CATEGORIES.map(colorForCategory);
    expect(new Set(cores).size).toBe(EXPENSE_CATEGORIES.length);
  });

  it("tem espectro suficiente para cobrir todas as despesas", () => {
    expect(CHART_SERIES.length).toBeGreaterThanOrEqual(EXPENSE_CATEGORIES.length);
  });

  it("usa o espectro de gráfico tokenizado, nunca hex fixo", () => {
    expect(colorForCategory("Alimentação")).toMatch(/^rgb\(var\(--chart-[1-9]\)\)$/);
    CHART_SERIES.forEach((c) => expect(c).toMatch(/^rgb\(var\(--chart-[1-9]\)\)$/));
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
