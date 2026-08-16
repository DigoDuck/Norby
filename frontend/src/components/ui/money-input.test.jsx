import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MoneyInput } from "./money-input";

function setup(valorInicial = 0, extraProps = {}) {
  const onChange = vi.fn();
  const utils = render(
    <MoneyInput value={valorInicial} onChange={onChange} aria-label="Valor" {...extraProps} />,
  );
  return {
    input: screen.getByLabelText("Valor"),
    onChange,
    // Re-renderiza com um novo `value`: MoneyInput é controlado, então o
    // teste precisa "devolver" o valor emitido pelo onChange como faria o
    // componente pai, senão o segundo evento ainda vê o value antigo.
    setValue: (novoValor, novasProps = extraProps) =>
      utils.rerender(
        <MoneyInput
          value={novoValor}
          onChange={onChange}
          aria-label="Valor"
          {...novasProps}
        />,
      ),
  };
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

  it("prende o cursor no fim ao clicar no meio do texto", () => {
    // Bug real: clicar no meio de "1.234,56" e digitar deixava o dígito
    // entrar na posição do clique em vez de ir pro fim, trocando o valor
    // inteiro sem o usuário entender por quê. jsdom não simula clique →
    // posição de caret (não calcula layout de texto), então simulamos o
    // clique no meio ajustando selectionRange manualmente antes do evento —
    // o que dá pra verificar aqui é que o handler sempre devolve a seleção
    // pro fim, não a posição visual real do clique.
    const { input } = setup(1234.56);
    input.setSelectionRange(3, 3);
    fireEvent.click(input);
    const fim = input.value.length;
    expect(input.selectionStart).toBe(fim);
    expect(input.selectionEnd).toBe(fim);
  });

  it("prende o cursor no fim também por navegação de teclado (setas, home)", () => {
    const { input } = setup(1234.56);
    input.setSelectionRange(0, 0); // simula "Home"
    fireEvent.keyUp(input, { key: "Home" });
    const fim = input.value.length;
    expect(input.selectionStart).toBe(fim);
    expect(input.selectionEnd).toBe(fim);
  });

  it("deixa seleção de intervalo intacta para Ctrl+A (substituir)", () => {
    // Reproduz o bug real: Ctrl+A seleciona todo o texto, mas fixarCursorNoFim
    // colapsava a seleção no fim, impedindo o usuário de digitar por cima. Com
    // a correção, uma seleção de intervalo (selectionStart !== selectionEnd)
    // sobrevive ao evento select, e o usuário consegue substituir o valor.
    const { input } = setup(1234.56);
    const fim = input.value.length;
    input.setSelectionRange(0, fim); // simula Ctrl+A (seleção completa)
    fireEvent.select(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(fim);
  });

  it("com allowNegative, a tecla '-' alterna o sinal do valor atual", () => {
    const { input, onChange, setValue } = setup(150.5, { allowNegative: true });

    fireEvent.keyDown(input, { key: "-" });
    expect(onChange).toHaveBeenLastCalledWith(-150.5);

    // Simula o pai controlado devolvendo o valor que o onChange emitiu.
    setValue(-150.5);
    fireEvent.keyDown(input, { key: "-" });
    expect(onChange).toHaveBeenLastCalledWith(150.5);
  });

  it("sem allowNegative (default), a tecla '-' é ignorada como qualquer outro caractere", () => {
    const { input, onChange } = setup(150.5);

    fireEvent.keyDown(input, { key: "-" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("com allowNegative, colar um valor com '-' num campo zerado preserva o sinal", () => {
    // Bug real: colar "-150,50" descartava o "-" e enviava 150.5, porque o
    // sinal só era reaplicado a partir do "value" anterior (que em 0 não tem
    // sinal nenhum pra reaplicar). O texto colado tem que ser lido também.
    const { input, onChange } = setup(0, { allowNegative: true });
    fireEvent.change(input, { target: { value: "-150,50" } });
    expect(onChange).toHaveBeenLastCalledWith(-150.5);
  });

  it("sem allowNegative, colar um valor com '-' ignora o sinal", () => {
    const { input, onChange } = setup(0);
    fireEvent.change(input, { target: { value: "-150,50" } });
    expect(onChange).toHaveBeenLastCalledWith(150.5);
  });

  it("corta em 15 dígitos de centavos (MAX_MONEY): o 16º dígito é ignorado, não desloca o número", () => {
    const { input, onChange } = setup();

    fireEvent.change(input, { target: { value: "999999999999999" } }); // 15 dígitos
    expect(onChange).toHaveBeenLastCalledWith(9999999999999.99);

    fireEvent.change(input, { target: { value: "9999999999999999" } }); // 16 dígitos
    expect(onChange).toHaveBeenLastCalledWith(9999999999999.99);
  });
});
