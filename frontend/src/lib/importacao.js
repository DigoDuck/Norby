import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";

// Regras da revisão de importação (spec B). Funções puras: o componente só
// guarda estado e desenha.

export const LIMITE_ARQUIVO = 1_048_576; // o mesmo teto do backend

const centavos = (valor) => Math.round(Number(valor) * 100);
const vaiSerLancada = (linha) => linha.marcada && linha.launch_as !== "IGNORE";

export const duplicada = (linha, walletId) => linha.duplicate_in.includes(walletId);

// Recalculada quando "Lançar em" muda: duplicata depende da carteira.
export function linhasIniciais(previa, walletId) {
  return previa.items.map((item, indice) => ({
    ...item,
    id: indice,
    marcada: item.launch_as !== "IGNORE" && !duplicada(item, walletId),
    transfer_wallet_id:
      item.kind === "CARD_PAYMENT" && item.launch_as === "TRANSFER" ? previa.default_card_id : null,
  }));
}

export function categoriaPara(launchAs, categoria) {
  const lista = launchAs === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return lista.includes(categoria) ? categoria : "Outros";
}

// Entradas e saídas separadas: um sinal trocado pela IA (visto no PDF) quase
// não mexe numa soma única, mas salta aos olhos aqui.
export function totais(linhas) {
  let entradas = 0;
  let saidas = 0;
  for (const linha of linhas) {
    if (!vaiSerLancada(linha)) continue;
    if (linha.direction === "IN") entradas += centavos(linha.amount);
    else saidas += centavos(linha.amount);
  }
  return { entradas: entradas / 100, saidas: saidas / 100 };
}

// Todas as linhas da prévia, marcadas ou não: é o número para conferir com o banco.
export function totaisDoArquivo(linhas) {
  let entradas = 0;
  let saidas = 0;
  for (const linha of linhas) {
    if (linha.direction === "IN") entradas += centavos(linha.amount);
    else saidas += centavos(linha.amount);
  }
  return { entradas: entradas / 100, saidas: saidas / 100 };
}

export function efeitoNoSaldo(linhas) {
  let total = 0;
  for (const linha of linhas) {
    if (!vaiSerLancada(linha)) continue;
    const valor = centavos(linha.amount);
    if (linha.launch_as === "EXPENSE") total -= valor;
    else if (linha.launch_as === "INCOME") total += valor;
    else total += linha.direction === "IN" ? valor : -valor;
  }
  return total / 100;
}

// "Sim" quando a carteira nasceu depois do período do arquivo: o saldo
// informado na criação já incluía esses lançamentos.
export function jaNoSaldoPorPadrao(carteira, linhas) {
  if (!carteira?.created_at || linhas.length === 0) return false;
  const ultima = linhas.reduce((max, l) => (l.date > max ? l.date : max), linhas[0].date);
  return carteira.created_at.slice(0, 10) > ultima;
}

export function montarConfirmacao(walletId, jaNoSaldo, linhas) {
  return {
    wallet_id: walletId,
    already_in_balance: jaNoSaldo,
    items: linhas.filter(vaiSerLancada).map((l) => ({
      date: l.date,
      description: l.description,
      amount: l.amount,
      direction: l.direction,
      launch_as: l.launch_as,
      ...(l.launch_as === "TRANSFER"
        ? { transfer_wallet_id: l.transfer_wallet_id }
        : { category: l.category }),
    })),
  };
}

export function prontaParaLancar(walletId, linhas) {
  const lancadas = linhas.filter(vaiSerLancada);
  return (
    Boolean(walletId) &&
    lancadas.length > 0 &&
    lancadas.every(
      (l) => l.launch_as !== "TRANSFER" || (l.transfer_wallet_id && l.transfer_wallet_id !== walletId),
    )
  );
}
