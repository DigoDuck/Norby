import { describe, expect, it } from "vitest";
import { CHART_SERIES, hashIndex } from "./palette";

describe("palette", () => {
  it("usa o espectro de gráfico tokenizado, nunca hex fixo", () => {
    CHART_SERIES.forEach((c) => expect(c).toMatch(/^rgb\(var\(--chart-[1-9]\)\)$/));
  });

  it("hashIndex fica sempre dentro do intervalo", () => {
    ["", "a", "Contas & Serviços", "x".repeat(200)].forEach((s) => {
      const i = hashIndex(s, 6);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    });
  });
});
