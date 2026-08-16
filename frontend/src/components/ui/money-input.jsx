import { Input } from "@/components/ui/input";

// Máscara monetária: o campo guarda CENTAVOS, e o que o usuário digita entra
// sempre pela direita. Toda a lógica é "pegue os dígitos, divida por 100" — é
// isso que faz o cursor parecer andar da direita para a esquerda sem precisar
// gerenciar posição de cursor à mão.
//
// Contrato: value e onChange trafegam NÚMERO EM REAIS (12.34), nunca a string
// mascarada. Assim o Zod e o payload da API continuam iguais.
function formatar(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MoneyInput({ value = 0, onChange, ...props }) {
  const centavos = Math.round(Number(value || 0) * 100);

  function handleChange(e) {
    const digitos = e.target.value.replace(/\D/g, "");
    // Corta em 13 dígitos: Numeric(15,2) no banco não aceita mais que isso, e
    // sem o corte o número estoura a precisão do float do JS antes disso.
    const limitado = digitos.slice(0, 13);
    onChange(Number(limitado || 0) / 100);
  }

  // Preenchimento é sempre pela direita: o cursor tem que ficar preso no fim,
  // senão clicar no meio do texto faz a tecla seguinte entrar numa posição
  // diferente da que o usuário via (o dígito cai no lugar errado). Cobre
  // clique, foco por tab e navegação por teclado.
  //
  // Guard: só reposiciona se a seleção estiver colapsada (selectionStart ===
  // selectionEnd). Uma seleção de intervalo (ex.: Ctrl+A) é intenção do
  // usuário de substituir o valor, então deixamos ela intacta e o usuário
  // consegue digitar por cima normalmente.
  function fixarCursorNoFim(e) {
    const el = e.target;
    const fim = el.value.length;
    if (el.selectionStart === el.selectionEnd && el.selectionEnd !== fim) {
      el.setSelectionRange(fim, fim);
    }
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={formatar(centavos)}
      onChange={handleChange}
      onClick={fixarCursorNoFim}
      onFocus={fixarCursorNoFim}
      onKeyUp={fixarCursorNoFim}
      onSelect={fixarCursorNoFim}
    />
  );
}

export { MoneyInput };
