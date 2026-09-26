import nubank from "@/assets/banks/nubank.svg";
import itau from "@/assets/banks/itau.svg";
import bradesco from "@/assets/banks/bradesco.svg";
import bb from "@/assets/banks/bb.svg";
import caixa from "@/assets/banks/caixa.svg";
import santander from "@/assets/banks/santander.svg";
import inter from "@/assets/banks/inter.svg";
import c6 from "@/assets/banks/c6.svg";
import picpay from "@/assets/banks/picpay.svg";
import mercadopago from "@/assets/banks/mercadopago.svg";
import neon from "@/assets/banks/neon.svg";
import xp from "@/assets/banks/xp.svg";
import btg from "@/assets/banks/btg.svg";
import pan from "@/assets/banks/pan.svg";
import original from "@/assets/banks/original.svg";
import pagbank from "@/assets/banks/pagbank.svg";
import stone from "@/assets/banks/stone.svg";
import infinitepay from "@/assets/banks/infinitepay.svg";
import cora from "@/assets/banks/cora.svg";

/**
 * Catálogo de bancos para a marca da carteira (issue #34).
 *
 * LOGO REAL, COM RISCO ACEITO. A primeira versão (commit 0032022) recusou os
 * logos: o art. 132 da LPI não tem exceção que cubra exibir marca de terceiro
 * num app pago, e o desenho é obra protegida por direito autoral, que este
 * repositório público redistribuiria. Em 2026-09-25 o dono do produto decidiu
 * exibir os logos mesmo assim, ciente desse risco.
 *
 * Fonte: github.com/Tgentil/Bancos-em-SVG, que NÃO declara licença. Arquivos
 * sem alteração (manual de marca proíbe recolorir), auditados antes do commit
 * (sem script, sem referência externa) e exibidos via <img>, onde o navegador
 * nunca executa script de SVG. Recuar é tirar o campo `logo`: a sigla de duas
 * letras continua como fallback em WalletMark.
 *
 * A ordem é a de exibição no seletor, com os mais usados primeiro.
 */
export const BANCOS = [
  { slug: "nubank", label: "Nubank", marca: "Nu", logo: nubank },
  { slug: "itau", label: "Itaú", marca: "It", logo: itau },
  { slug: "bradesco", label: "Bradesco", marca: "Br", logo: bradesco },
  { slug: "bb", label: "Banco do Brasil", marca: "BB", logo: bb },
  { slug: "caixa", label: "Caixa", marca: "Cx", logo: caixa },
  { slug: "santander", label: "Santander", marca: "St", logo: santander },
  { slug: "inter", label: "Inter", marca: "In", logo: inter },
  { slug: "c6", label: "C6 Bank", marca: "C6", logo: c6 },
  { slug: "picpay", label: "PicPay", marca: "Pp", logo: picpay },
  { slug: "mercadopago", label: "Mercado Pago", marca: "MP", logo: mercadopago },
  // Segundo lote (2026-09-26), bancos digitais pedidos pelo dono. Mesma fonte
  // e mesma auditoria dos dez primeiros; um arquivo por banco, a versão só com
  // o símbolo e sem a variante branca, porque o logo fica sobre fundo branco.
  { slug: "neon", label: "Neon", marca: "Ne", logo: neon },
  { slug: "xp", label: "XP", marca: "XP", logo: xp },
  { slug: "btg", label: "BTG Pactual", marca: "BT", logo: btg },
  { slug: "pan", label: "Pan", marca: "Pa", logo: pan },
  { slug: "original", label: "Original", marca: "Or", logo: original },
  { slug: "pagbank", label: "PagBank", marca: "PB", logo: pagbank },
  { slug: "stone", label: "Stone", marca: "So", logo: stone },
  { slug: "infinitepay", label: "InfinitePay", marca: "IP", logo: infinitepay },
  { slug: "cora", label: "Cora", marca: "Co", logo: cora },
  // "Dinheiro" fica porque diz algo que nenhum banco diz: a carteira é física.
  // "Outro" NÃO entra: a opção vazia do seletor já é ela, e oferecer as duas
  // seria pedir ao usuário para escolher entre dois nomes da mesma coisa.
  { slug: "dinheiro", label: "Dinheiro", marca: "R$" },
];

const POR_SLUG = new Map(BANCOS.map((b) => [b.slug, b]));

/** O banco do slug, ou `undefined` para nulo e para slug desconhecido. */
export function banco(slug) {
  return slug ? POR_SLUG.get(slug) : undefined;
}

// Nome de carteira é digitado à mão: "itau ", "ITAÚ" e "Itaú" são o mesmo banco.
const normalizar = (texto) =>
  texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

// O rótulo ("BTG Pactual") e o nome curto, que é o slug ("btg", "c6", "bb").
const POR_NOME = new Map(BANCOS.flatMap((b) => [[normalizar(b.label), b], [b.slug, b]]));

/**
 * O banco que a marca da carteira mostra. Sem banco escolhido, vale o nome
 * quando ele É o de um banco do catálogo: carteira criada antes do campo
 * Banco (ou sem mexer nele) se chama "Nubank" e mostrava só a inicial "N".
 * Nome que não é de banco ("Conta Corrente") segue sem banco.
 */
export function bancoDaCarteira(wallet) {
  if (wallet.bank) return banco(wallet.bank);
  return POR_NOME.get(normalizar(wallet.name ?? ""));
}

/** Opções do `<Select>`, com "" para "sem banco". */
export const OPCOES_BANCO = [
  { value: "", label: "Sem banco" },
  ...BANCOS.map((b) => ({ value: b.slug, label: b.label })),
];
