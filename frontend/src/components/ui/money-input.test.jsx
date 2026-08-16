import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MoneyInput } from "./money-input";

function setup(valorInicial = 0) {
  const onChange = vi.fn();
  render(<MoneyInput value={valorInicial} onChange={onChange} aria-label="Valor" />);
  return { input: screen.getByLabelText("Valor"), onChange };
}

describe("MoneyInput", () => {
  it("começa em 0,00", () => {
    const { input } = setup();
    expect(input).toHaveValue("0,00");
  });

  it("preenche da direita para a esquerda", () => {
    const { input, onChange } = setup();

    fireEvent.change(input, { target: { value: "0,001" } }); // usuário digitou "1"
    expect(onChange).toHaveBeenLastCalledWith(0.01);

    fireEvent.change(input, { target: { value: "0,0112" } }); // digitou "1" e "2"
    expect(onChange).toHaveBeenLastCalledWith(1.12);
  });

  it("ignora qualquer coisa que não seja dígito", () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: "0,00abc5" } });
    expect(onChange).toHaveBeenLastCalledWith(0.05);
  });

  it("apaga da direita para a esquerda", () => {
    const { input, onChange } = setup(12.34);
    fireEvent.change(input, { target: { value: "12,3" } }); // backspace
    expect(onChange).toHaveBeenLastCalledWith(1.23);
  });

  it("formata o valor recebido por prop", () => {
    const { input } = setup(1234.5);
    expect(input).toHaveValue("1.234,50");
  });
});
