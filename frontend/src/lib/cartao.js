// Cartão de crédito é uma carteira com saldo devedor (ADR 0005): o negativo é a
// fatura. Carteiras e Dashboard precisam mostrar o mesmo rótulo e o mesmo valor
// sem sinal, então a regra mora aqui, num lugar só.

export const ehCartao = (wallet) => wallet?.kind === "CREDIT_CARD";

/**
 * O que um cartão mostra no lugar do saldo com sinal.
 * `emCredito`: pagou a mais e o saldo ficou positivo. `valor`: sempre >= 0.
 */
export function faturaDoCartao(wallet) {
  const saldo = Number(wallet.balance);
  return { emCredito: saldo > 0, valor: Math.abs(saldo) };
}
