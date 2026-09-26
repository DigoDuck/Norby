import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import CategoryPie from "./CategoryPie";

const FATIAS = [
  { name: "Moradia", value: 980 },
  { name: "Alimentação", value: 120 },
];

const destaques = (extra) => ({
  mediaDiaria: 44,
  diasDecorridos: 25,
  maiorGasto: { amount: "980.00", description: "Aluguel", category: "Moradia" },
  variacao: 10,
  ...extra,
});

// O <div> do rodapé que tem o rótulo `rotulo` (dt) e os valores dele (dd).
const item = (rotulo) => screen.getByText(rotulo).parentElement;

describe("CategoryPie, rodapé do mês", () => {
  // Despesa que sobe é notícia ruim: a cor não pode seguir o "subiu = verde"
  // dos KPIs de receita.
  it.each([
    ["subiram", 191, "191%", "text-expense"],
    ["caíram", -12, "12%", "text-income"],
  ])("despesas que %s contra o mês passado", (_, variacao, texto, cor) => {
    render(<CategoryPie data={FATIAS} total={1100} destaques={destaques({ variacao })} />);

    const valor = within(item("Vs. mês passado")).getByText(texto);
    expect(valor).toHaveClass(cor);
  });

  it("sem despesa no mês nem mês anterior, não inventa número", () => {
    render(
      <CategoryPie
        data={FATIAS}
        total={1100}
        destaques={destaques({ maiorGasto: null, variacao: undefined })}
      />,
    );

    expect(within(item("Maior lançamento")).getByText("sem despesas")).toBeInTheDocument();
    expect(within(item("Vs. mês passado")).getByText("—")).toBeInTheDocument();
  });
});
