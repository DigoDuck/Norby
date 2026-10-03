import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";

// Regras da revisão de importação (spec B). Funções puras: o componente só
// guarda estado e desenha.

export const LIMITE_ARQUIVO = 1_048_576; // o mesmo teto do backend

const centavos = (valor) => Math.round(Number(valor) * 100);
const vaiSerLancada = (linha) => linha.marcada && linha.launch_as !== "IGNORE";

// Transferência: duplicada só no mesmo par (origem, destino) da direção da
// linha, porque uma transferência para a reserva não paga a fatura do cartão
// (revisão do Codex, 2026-10-03). Outras linhas: a carteira tem o lançamento,
// ou tem uma transferência que esta linha virou numa importação anterior.
export function duplicada(linha, walletId) {
  const pares = linha.duplicate_pairs ?? [];
  if (linha.launch_as === "TRANSFER") {
    const destino = linha.transfer_wallet_id;
    const [de, para] = linha.direction === "IN" ? [destino, walletId] : [walletId, destino];
    return pares.some(([f, t]) => f === de && t === para);
  }
  return linha.duplicate_in.includes(walletId) || pares.some((par) => par.includes(walletId));
}

// Recalculada quando "Lançar em" muda: duplicata depende da carteira. O
// destino padrão entra ANTES da marcação, que depende dele.
export function linhasIniciais(previa, walletId) {
  return previa.items.map((item, indice) => {
    const linha = {
      ...item,
      id: indice,
      transfer_wallet_id:
        item.kind === "CARD_PAYMENT" && item.launch_as === "TRANSFER" ? previa.default_card_id : null,
    };
    return { ...linha, marcada: item.launch_as !== "IGNORE" && !duplicada(linha, walletId) };
  });
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

export function montarConfirmacao(walletId, jaNoSaldo, linhas, chave) {
  return {
    wallet_id: walletId,
    already_in_balance: jaNoSaldo,
    idempotency_key: chave,
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
