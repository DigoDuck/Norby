import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RitmoCard from "./RitmoCard";

const lancamento = (type, amount, date) => ({ type, amount, date });

// Hoje: sexta, 25/09/2026. A janela de 26 semanas tem 181 dias (25 semanas
// inteiras + domingo..sexta), então 18.100 de receita dão cota de 100 por dia.
// Dia 20 estoura (150); de 21 a 25 fica dentro da cota: sequência de 5 dias.
const LANCAMENTOS = [
  lancamento("INCOME", "18100.00", "2026-07-01"),
  lancamento("EXPENSE", "150.00", "2026-09-20"),
  lancamento("EXPENSE", "80.00", "2026-09-22"),
  lancamento("EXPENSE", "50.00", "2026-09-23"),
];

// A largura que o card mede antes da pintura (clientWidth do jsdom é 0).
function larguraDoCard(px) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(px);
}

describe("RitmoCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 25, 12));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Se a largura voltar a entrar no cálculo, o celular (8 semanas, 55 dias)
  // dá cota de R$ 329,09 e o dia 20 deixa de estourar.
  it.each([
    ["celular", 300],
    ["desktop", 1000],
  ])("no %s a cota e a sequência são as mesmas", (_, px) => {
    larguraDoCard(px);

    render(<RitmoCard transactions={LANCAMENTOS} />);

    expect(screen.getByText("Cota de R$ 100,00 por dia")).toBeInTheDocument();
    expect(screen.getByText("5 dias seguidos")).toBeInTheDocument();
  });
});
