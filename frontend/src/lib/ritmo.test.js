import { describe, it, expect } from "vitest";
import { computeRitmo, headroom, heatLevel, heatGrid, windowDays, weeksThatFit } from "./ritmo";

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

describe("heatLevel", () => {
  const PACE = 100;
  const cell = (spent, active = true) => ({ spent, active, onPace: spent <= PACE });

  it("sem cota tudo fica neutro, até o dia com gasto", () => {
    // Antes o dia com gasto e sem receita na janela saía vermelho: "estourou"
    // uma cota que nem existia.
    expect(heatLevel({ spent: 50, active: true, onPace: false }, 0)).toBe(0);
  });

  it("dia sem lançamento é nível 1, no ritmo por omissão", () => {
    // Casa o mapa com a frase "X dos últimos N dias": esses dias já contam lá.
    expect(heatLevel(cell(0, false), PACE)).toBe(1);
  });

  it("dia com gasto sobe de nível conforme a folga", () => {
    expect(heatLevel(cell(90), PACE)).toBe(2);
    expect(heatLevel(cell(50), PACE)).toBe(3);
    expect(heatLevel(cell(10), PACE)).toBe(4);
  });

  it("estourar a cota é over", () => {
    expect(heatLevel({ spent: 150, active: true, onPace: false }, PACE)).toBe("over");
  });
});

describe("heatGrid", () => {
  // 25/09/2026 é sexta. Janela de 42 dias: 15/08 (sábado) a 25/09.
  const r = computeRitmo([], 42, new Date(2026, 8, 25));
  const grid = heatGrid(r.cells);

  it("cada célula sabe o próprio dia da semana, pela data local", () => {
    // Nada de new Date("2026-09-25"): isso é UTC e, em UTC-3, cai na quinta.
    expect(r.cells.at(-1).weekday).toBe(5);
    expect(r.cells[0].weekday).toBe(6);
  });

  it("colunas são semanas de domingo a sábado, preenchidas de cima para baixo", () => {
    expect(grid.weeks[0]).toHaveLength(7);
    expect(grid.weeks[0].slice(0, 6)).toEqual(Array(6).fill(null)); // dom-sex antes da janela
    expect(grid.weeks[0][6].key).toBe("2026-08-15");
    expect(grid.weeks[1][0].key).toBe("2026-08-16"); // domingo abre a coluna seguinte
    expect(grid.weeks).toHaveLength(7); // 6 vazios + 42 dias = 48 casas
    expect(grid.weeks.at(-1).at(-1).key).toBe("2026-09-25");
  });

  it("rotula o mês na primeira coluna e onde um mês começa", () => {
    expect(grid.months).toEqual(["Ago", "", "", "Set", "", "", ""]);
  });
});

describe("windowDays", () => {
  it("começa num domingo e termina hoje, então toda coluna fica cheia", () => {
    const sexta = new Date(2026, 8, 25);
    const dias = windowDays(6, sexta);
    expect(dias).toBe(41); // 5 semanas cheias + domingo a sexta
    const r = computeRitmo([], dias, sexta);
    expect(r.cells[0].weekday).toBe(0);
    expect(heatGrid(r.cells).weeks[0][0]).not.toBeNull();
  });

  it("num domingo a última coluna tem um dia só", () => {
    expect(windowDays(3, new Date(2026, 8, 27))).toBe(15);
  });
});

describe("weeksThatFit", () => {
  const opts = { cell: 30, gap: 4, label: 30, min: 4, max: 26 };

  it("cabe o que a largura permite, com quadrados de ~30px", () => {
    // 30 do rótulo + 16 colunas de 34 = 574
    expect(weeksThatFit(574, opts)).toBe(16);
  });

  it("nunca passa do máximo que o painel busca", () => {
    expect(weeksThatFit(5000, opts)).toBe(26);
  });

  it("card estreito ainda mostra o mínimo", () => {
    expect(weeksThatFit(80, opts)).toBe(4);
  });
});
