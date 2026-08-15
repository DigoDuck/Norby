import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Segmented } from "./segmented";

const OPTS = [
  { value: "EXPENSE", label: "Despesa" },
  { value: "INCOME", label: "Receita" },
];

describe("Segmented", () => {
  it("marca a opção selecionada com aria-pressed", () => {
    // Sem isso, "Despesa está selecionada" existe só como cor de fundo, e o
    // DESIGN.md proíbe cor como canal semântico único.
    render(
      <Segmented value="EXPENSE" onChange={vi.fn()} options={OPTS} ariaLabel="Tipo" />,
    );
    expect(screen.getByRole("button", { name: "Despesa" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Receita" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("nomeia o grupo de botões", () => {
    render(
      <Segmented value="EXPENSE" onChange={vi.fn()} options={OPTS} ariaLabel="Tipo" />,
    );
    expect(screen.getByRole("group", { name: "Tipo" })).toBeInTheDocument();
  });

  it("continua reportando a escolha", () => {
    const onChange = vi.fn();
    render(
      <Segmented value="EXPENSE" onChange={onChange} options={OPTS} ariaLabel="Tipo" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Receita" }));
    expect(onChange).toHaveBeenCalledWith("INCOME");
  });
});
