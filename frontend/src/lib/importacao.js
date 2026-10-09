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

// Quanto a linha mexe no saldo da carteira, em centavos e com sinal. Mesma
// regra do backend: receita e despesa pelo "Lançar como", transferência pela
// direção. Totais e saldos saem daqui, então não têm como discordar.
function efeito(linha) {
  const valor = centavos(linha.amount);
  if (linha.launch_as === "EXPENSE") return -valor;
  if (linha.launch_as === "INCOME") return valor;
  return linha.direction === "IN" ? valor : -valor;
}

// Entradas e saídas separadas, pelo lado em que o saldo se move: um sinal
// trocado pela IA (visto no PDF) quase não mexe numa soma única, mas salta aos
// olhos aqui. "No arquivo" (totaisDoArquivo) segue a direção do banco.
export function totais(linhas) {
  let entradas = 0;
  let saidas = 0;
  for (const linha of linhas) {
    if (!vaiSerLancada(linha)) continue;
    const valor = efeito(linha);
    if (valor > 0) entradas += valor;
    else saidas -= valor;
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

// A carteira escolhida e a outra ponta de cada transferência: o pagamento da
// fatura também muda o saldo do cartão, e a revisão precisa mostrar isso.
export function saldosAfetados(walletId, linhas, carteiras) {
  const deltas = new Map([[walletId, 0]]);
  for (const linha of linhas) {
    if (!vaiSerLancada(linha)) continue;
    const valor = efeito(linha);
    deltas.set(walletId, deltas.get(walletId) + valor);
    if (linha.launch_as === "TRANSFER" && linha.transfer_wallet_id) {
      const outra = linha.transfer_wallet_id;
      deltas.set(outra, (deltas.get(outra) ?? 0) - valor);
    }
  }
  return [...deltas].flatMap(([id, delta]) => {
    const carteira = carteiras.find((c) => c.id === id);
    if (!carteira) return [];
    const antes = Number(carteira.balance);
    return [{ id, nome: carteira.name, antes, depois: (centavos(antes) + delta) / 100 }];
  });
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

// Transferência que vai ser lançada sem outra carteira válida: sem destino, ou
// com a própria carteira de lançamento como destino.
export function faltaDestino(linha, walletId) {
  return (
    vaiSerLancada(linha) &&
    linha.launch_as === "TRANSFER" &&
    (!linha.transfer_wallet_id || linha.transfer_wallet_id === walletId)
  );
}

export function prontaParaLancar(walletId, linhas) {
  return (
    Boolean(walletId) &&
    linhas.some(vaiSerLancada) &&
    !linhas.some((l) => faltaDestino(l, walletId))
  );
}
