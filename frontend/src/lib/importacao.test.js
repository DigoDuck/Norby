import { describe, expect, it } from "vitest";

import {
  categoriaPara, duplicada, efeitoNoSaldo, jaNoSaldoPorPadrao, linhasIniciais,
  montarConfirmacao, prontaParaLancar, totais,
} from "./importacao";

const item = (extra = {}) => ({
  date: "2026-08-10", description: "Mercado", amount: "52.30", direction: "OUT",
  kind: "PURCHASE", launch_as: "EXPENSE", category: "Alimentação", duplicate_in: [],
  ...extra,
});

const previa = (items, extra = {}) => ({
  document_type: "ACCOUNT_STATEMENT", format: "csv", ignored: 0,
  default_wallet_id: "conta", default_card_id: "cartao", items, ...extra,
});

describe("linhasIniciais", () => {
  it("marca o que vai ser lançado, desmarca ignorado e duplicado na carteira", () => {
    const linhas = linhasIniciais(previa([
      item(),
      item({ kind: "TRANSFER", launch_as: "IGNORE", category: null }),
      item({ duplicate_in: ["conta"] }),
      item({ duplicate_in: ["outra"] }),
    ]), "conta");
    expect(linhas.map((l) => l.marcada)).toEqual([true, false, false, true]);
  });

  it("pagamento de fatura já vem com o cartão como destino", () => {
    const [linha] = linhasIniciais(previa([
      item({ kind: "CARD_PAYMENT", launch_as: "TRANSFER", category: null }),
    ]), "conta");
    expect(linha.transfer_wallet_id).toBe("cartao");
  });
});

it("duplicada depende da carteira escolhida", () => {
  const linha = item({ duplicate_in: ["conta"] });
  expect(duplicada(linha, "conta")).toBe(true);
  expect(duplicada(linha, "outra")).toBe(false);
});

it("categoriaPara mantém a categoria válida e cai em Outros", () => {
  expect(categoriaPara("INCOME", "Salário")).toBe("Salário");
  expect(categoriaPara("INCOME", "Alimentação")).toBe("Outros");
  expect(categoriaPara("EXPENSE", null)).toBe("Outros");
});

describe("totais e saldo", () => {
  const linhas = [
    { ...item({ amount: "0.10" }), marcada: true },
    { ...item({ amount: "0.20" }), marcada: true },
    { ...item({ amount: "1000.00", direction: "IN", launch_as: "INCOME" }), marcada: true },
    { ...item({ amount: "300.00", launch_as: "TRANSFER" }), marcada: true },
    { ...item({ amount: "999.00" }), marcada: false },
    { ...item({ amount: "50.00", launch_as: "IGNORE" }), marcada: true },
  ];

  it("soma entradas e saídas separadas, em centavos, só do que vai ser lançado", () => {
    // 0,10 + 0,20 em float daria 0,30000000000000004.
    expect(totais(linhas)).toEqual({ entradas: 1000, saidas: 300.3 });
  });

  it("efeito no saldo: despesa e transferência de saída descem, receita sobe", () => {
    expect(efeitoNoSaldo(linhas)).toBe(1000 - 0.3 - 300);
  });
});

describe("jaNoSaldoPorPadrao", () => {
  const linhas = [item({ date: "2026-08-01" }), item({ date: "2026-08-31" })];

  it("sim quando a carteira nasceu depois da última data do arquivo", () => {
    expect(jaNoSaldoPorPadrao({ created_at: "2026-09-05T12:00:00Z" }, linhas)).toBe(true);
  });

  it("não quando a carteira já existia no período", () => {
    expect(jaNoSaldoPorPadrao({ created_at: "2026-07-01T12:00:00Z" }, linhas)).toBe(false);
    expect(jaNoSaldoPorPadrao(undefined, linhas)).toBe(false);
  });
});

describe("montarConfirmacao e prontaParaLancar", () => {
  const linhas = [
    { ...item(), marcada: true, transfer_wallet_id: null },
    { ...item({ launch_as: "TRANSFER", category: null }), marcada: true, transfer_wallet_id: "cartao" },
    { ...item({ description: "Fora" }), marcada: false, transfer_wallet_id: null },
    { ...item({ launch_as: "IGNORE" }), marcada: true, transfer_wallet_id: null },
  ];

  it("manda só as marcadas e não ignoradas, com categoria ou destino", () => {
    expect(montarConfirmacao("conta", true, linhas)).toEqual({
      wallet_id: "conta",
      already_in_balance: true,
      items: [
        { date: "2026-08-10", description: "Mercado", amount: "52.30", direction: "OUT",
          launch_as: "EXPENSE", category: "Alimentação" },
        { date: "2026-08-10", description: "Mercado", amount: "52.30", direction: "OUT",
          launch_as: "TRANSFER", transfer_wallet_id: "cartao" },
      ],
    });
  });

  it("exige carteira, alguma linha e destino válido em toda transferência", () => {
    expect(prontaParaLancar("conta", linhas)).toBe(true);
    expect(prontaParaLancar("", linhas)).toBe(false);
    expect(prontaParaLancar("cartao", linhas)).toBe(false);
    expect(prontaParaLancar("conta", [{ ...linhas[1], transfer_wallet_id: null }])).toBe(false);
    expect(prontaParaLancar("conta", [linhas[2]])).toBe(false);
  });
});
