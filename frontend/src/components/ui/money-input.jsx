import { Input } from "@/components/ui/input";

// Máscara monetária: o campo guarda CENTAVOS, e o que o usuário digita entra
// sempre pela direita. Toda a lógica é "pegue os dígitos, divida por 100" — é
// isso que faz o cursor parecer andar da direita para a esquerda sem precisar
// gerenciar posição de cursor à mão.
//
// Contrato: value e onChange trafegam NÚMERO EM REAIS (12.34), nunca a string
// mascarada. Assim o Zod e o payload da API continuam iguais.
//
// allowNegative (default false, os call sites atuais não mudam em nada): a
// tecla "-" alterna o sinal do valor atual em vez de ser um dígito. Digitar
// "-" num valor positivo torna negativo, digitar de novo torna positivo. Com
// allowNegative desligado, "-" é ignorado como qualquer outro caractere não
// numérico, igual ao comportamento de sempre.
//
// Colar também carrega sinal: um "-" presente no texto que chega (colagem ou
// digitação livre) vira negativo mesmo partindo de um campo zerado — não dá
// pra depender só do "value" anterior, porque em 0 não existe sinal prévio
// pra reaplicar (ver handleChange).
function formatar(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MoneyInput({ value = 0, onChange, allowNegative = false, ...props }) {
  const centavos = Math.round(Number(value || 0) * 100);

  function handleChange(e) {
    const texto = e.target.value;
    const digitos = texto.replace(/\D/g, "");
    // Corta em 15 dígitos: MAX_MONEY (Numeric(15,2) no banco) é
    // 9999999999999.99 — 13 dígitos inteiros + 2 decimais = 15 dígitos de
    // centavos. Acima disso o dígito extra é ignorado, não desloca o número.
    const limitado = digitos.slice(0, 15);
    const magnitude = Number(limitado || 0) / 100;
    // Sinal vem do texto que chegou (colar "-150,50" num campo zerado tem
    // que resultar em negativo) OU do sinal que o valor já carregava (digitar
    // por cima de um valor já negativo não apaga o "-" que ele mostrava).
    // Object.is(value, -0): quem controla este input pode representar
    // "magnitude zero, sinal negativo" como -0 (ver AmountPromptDialog) —
    // "-0 < 0" é false em JS, então sem esse check o sinal se perderia
    // exatamente quando o usuário digita o primeiro dígito depois de zero.
    const negativo = allowNegative && (texto.includes("-") || value < 0 || Object.is(value, -0));
    onChange(negativo ? -magnitude : magnitude);
  }

  // "-" alterna o sinal do valor atual (não é um dígito): intercepta no
  // keydown para nunca deixar o caractere entrar no texto. Em 0 é um no-op —
  // não há sinal para "prender" antes de existir magnitude.
  function handleKeyDown(e) {
    if (!allowNegative || e.key !== "-") return;
    e.preventDefault();
    if (value !== 0) onChange(-value);
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
      onKeyDown={handleKeyDown}
      onClick={fixarCursorNoFim}
      onFocus={fixarCursorNoFim}
      onKeyUp={fixarCursorNoFim}
      onSelect={fixarCursorNoFim}
    />
  );
}

export { MoneyInput };
