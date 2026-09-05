import { describe, expect, it } from "vitest";

import { BANCOS, banco, OPCOES_BANCO } from "./bancos";

describe("catálogo de bancos", () => {
  it("não repete slug", () => {
    // Slug repetido faria o Map descartar um dos bancos em silêncio, e o
    // seletor mostraria duas linhas que levam ao mesmo lugar.
    const slugs = BANCOS.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("mantém a marca curta o bastante para caber no chip", () => {
    // O chip tem 48px e usa text-lg. Três caracteres estouram.
    for (const b of BANCOS) {
      expect(b.marca.length, b.slug).toBeLessThanOrEqual(2);
      expect(b.marca.length, b.slug).toBeGreaterThanOrEqual(1);
    }
  });

  it("aceita o slug que o backend aceitaria", () => {
    // Espelha o pattern de `BankSlug` (schemas/common.py). Um slug com
    // maiúscula ou espaço passaria aqui e tomaria 422 na hora de salvar.
    for (const b of BANCOS) expect(b.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("devolve undefined para nulo e para slug desconhecido", () => {
    // O card chama isto com `w.bank`, que é null na maioria das carteiras.
    expect(banco(null)).toBeUndefined();
    expect(banco("")).toBeUndefined();
    expect(banco("banco-que-nao-existe")).toBeUndefined();
    expect(banco("nubank")?.marca).toBe("Nu");
  });

  it("oferece 'sem banco' como primeira opção do seletor", () => {
    // O valor vazio é o que faz o front OMITIR `bank` no envio.
    expect(OPCOES_BANCO[0].value).toBe("");
    expect(OPCOES_BANCO).toHaveLength(BANCOS.length + 1);
  });
});
