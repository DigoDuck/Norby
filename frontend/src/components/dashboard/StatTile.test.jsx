import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Wallet } from "lucide-react";
import StatTile from "./StatTile";

describe("StatTile", () => {
  it("receita que sobe é boa notícia", () => {
    render(<StatTile label="Receitas" value="R$ 10" icon={Wallet} delta={12} />);
    expect(screen.getByText("12%").closest("span")).toHaveClass("chip-pos");
  });

  it("despesa que sobe é má notícia, mesmo com a seta para cima", () => {
    render(<StatTile label="Despesas" value="R$ 10" icon={Wallet} delta={12} upIsGood={false} />);
    expect(screen.getByText("12%").closest("span")).toHaveClass("chip-neg");
  });

  it("sem mês anterior não inventa variação", () => {
    render(<StatTile label="Score IA" value="—" icon={Wallet} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByText("este mês")).toBeInTheDocument();
  });
});
