import { describe, it, expect } from "vitest";
import { computeRitmo, headroom } from "./ritmo";

// Janela curta e data fixa: o cálculo depende de "hoje", então nada de new Date().
const TODAY = new Date(2026, 6, 16); // 16/07/2026
const DAYS = 10;

const income = (date, amount) => ({ date, type: "INCOME", amount: String(amount) });
const expense = (date, amount) => ({ date, type: "EXPENSE", amount: String(amount) });

describe("computeRitmo", () => {
  it("dilui a renda da janela em uma cota diária", () => {
    const r = computeRitmo([income("2026-07-10", 1000)], DAYS, TODAY);
    expect(r.dailyPace).toBe(100); // 1000 / 10 dias
    expect(r.hasPace).toBe(true);
  });

  it("assalariado que gasta pouco fica no ritmo mesmo sem receita no dia", () => {
    // Este é o bug que motivou o módulo: pela regra antiga (receita do dia >=
    // despesa do dia) todo dia sem salário e com qualquer gasto era vermelho.
    const r = computeRitmo(
      [income("2026-07-10", 1000), expense("2026-07-16", 40)],
      DAYS,
      TODAY,
    );
    const hoje = r.cells.at(-1);
    expect(hoje.spent).toBe(40);
    expect(hoje.onPace).toBe(true); // 40 <= cota de 100
    expect(r.streak).toBe(DAYS); // nenhum dia estourou a cota
  });

  it("marca fora do ritmo o dia que estoura a cota e zera a sequência", () => {
    const r = computeRitmo(
      [income("2026-07-10", 1000), expense("2026-07-16", 250)],
      DAYS,
      TODAY,
    );
    expect(r.cells.at(-1).onPace).toBe(false); // 250 > 100
    expect(r.streak).toBe(0); // hoje estourou
    expect(r.onPaceCount).toBe(DAYS - 1);
  });

  it("soma vários gastos do mesmo dia antes de comparar com a cota", () => {
    const r = computeRitmo(
      [income("2026-07-10", 1000), expense("2026-07-16", 60), expense("2026-07-16", 60)],
      DAYS,
      TODAY,
    );
    expect(r.cells.at(-1).spent).toBe(120);
    expect(r.cells.at(-1).onPace).toBe(false); // 120 > 100, só somando dá pra ver
  });

  it("sem receita na janela não inventa cota", () => {
    const r = computeRitmo([expense("2026-07-16", 10)], DAYS, TODAY);
    expect(r.hasPace).toBe(false);
    expect(r.dailyPace).toBe(0);
    expect(r.onPaceCount).toBe(0); // nada é "no ritmo" sem ritmo definido
    expect(r.hasActivity).toBe(true); // mas houve lançamento
  });

  it("janela vazia não tem atividade", () => {
    const r = computeRitmo([], DAYS, TODAY);
    expect(r.hasActivity).toBe(false);
    expect(r.cells).toHaveLength(DAYS);
  });

  it("a janela termina hoje e tem o tamanho pedido", () => {
    const r = computeRitmo([], DAYS, TODAY);
    expect(r.cells.at(-1).key).toBe("2026-07-16");
    expect(r.cells[0].key).toBe("2026-07-07"); // 10 dias contando hoje
  });

  it("ignora lançamento com valor inválido", () => {
    const r = computeRitmo(
      [income("2026-07-10", 1000), { date: "2026-07-16", type: "EXPENSE", amount: "abc" }],
      DAYS,
      TODAY,
    );
    expect(r.cells.at(-1).spent).toBe(0);
  });
});

describe("headroom", () => {
  it("dia sem gasto tem folga total", () => {
    expect(headroom({ spent: 0 }, 100)).toBe(1);
  });

  it("gastar a cota exata zera a folga", () => {
    expect(headroom({ spent: 100 }, 100)).toBe(0);
  });

  it("estourar a cota não devolve folga negativa", () => {
    expect(headroom({ spent: 500 }, 100)).toBe(0);
  });

  it("o dia do salário não achata mais os demais", () => {
    // Regra antiga escalava pelo maior líquido positivo (o salário), então um
    // dia comum virava um teal quase invisível. A folga é relativa à cota.
    expect(headroom({ spent: 20 }, 100)).toBe(0.8);
  });
});
