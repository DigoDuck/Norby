// Checkout e Portal são HOSPEDADOS pelo Stripe (ADR 0001): a pessoa sai do
// app para a URL que a API devolve. Seguir essa URL sem olhar transformaria o
// botão "Assinar" num redirecionamento aberto se a API (ou a resposta) fosse
// adulterada — e o destino seria justamente uma tela que pede cartão.
// Só as duas origens que o backend de fato gera passam.
const ORIGENS_DO_STRIPE = new Set(["https://checkout.stripe.com", "https://billing.stripe.com"]);

// Devolve a própria URL se ela aponta para o Stripe hospedado, ou null.
// Compara a ORIGEM já parseada, não um prefixo de texto: prefixo aceitaria
// "https://checkout.stripe.com.evil.example" e credenciais embutidas.
export function urlDoStripe(url) {
  if (typeof url !== "string" || url === "") return null;
  let parseada;
  try {
    parseada = new URL(url);
  } catch {
    return null;
  }
  if (parseada.username || parseada.password) return null;
  return ORIGENS_DO_STRIPE.has(parseada.origin) ? url : null;
}
