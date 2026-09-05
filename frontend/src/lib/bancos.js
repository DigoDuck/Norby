/**
 * Catálogo de bancos para o chip da carteira (issue #34).
 *
 * MARCA DE DUAS LETRAS, NÃO O LOGO. Reproduzir a arte dos bancos esbarra em
 * dois direitos independentes: o art. 132 da LPI não tem exceção que cubra
 * exibir marca de terceiro num app pago (a de citação exige "sem conotação
 * comercial"), e o desenho em si é obra protegida por direito autoral, que no
 * Brasil nasce com a criação. Este repositório é público, então commitar um
 * `nubank.svg` seria redistribuir a arte para quem clonar. O nome do banco em
 * texto é uso descritivo e continua liberado — é o desenho que fica de fora.
 *
 * SEM COR DE MARCA. O DESIGN.md é explícito: "não há hex solto em componente,
 * toda cor sai de um token", e o contraste é medido sobre o vidro renderizado
 * NOS DOIS TEMAS. Roxo do Nubank ou verde do PicPay são hex fixos: passariam
 * num tema e reprovariam no outro. A cor do chip continua vindo da paleta do
 * app, só que chaveada pelo slug do banco em vez do nome da carteira — assim
 * todas as carteiras do mesmo banco ficam iguais entre si, que é o ganho de
 * reconhecimento que importa aqui.
 *
 * A cor AGRUPA, não identifica: são mais bancos que cores na paleta, então dois
 * bancos diferentes podem calhar na mesma. Quem identifica é a marca.
 *
 * A ordem é a de exibição no seletor, com os mais usados primeiro.
 */
export const BANCOS = [
  { slug: "nubank", label: "Nubank", marca: "Nu" },
  { slug: "itau", label: "Itaú", marca: "It" },
  { slug: "bradesco", label: "Bradesco", marca: "Br" },
  { slug: "bb", label: "Banco do Brasil", marca: "BB" },
  { slug: "caixa", label: "Caixa", marca: "Cx" },
  { slug: "santander", label: "Santander", marca: "St" },
  { slug: "inter", label: "Inter", marca: "In" },
  { slug: "c6", label: "C6 Bank", marca: "C6" },
  { slug: "picpay", label: "PicPay", marca: "Pp" },
  { slug: "mercadopago", label: "Mercado Pago", marca: "MP" },
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

/** Opções do `<Select>`, com "" para "sem banco". */
export const OPCOES_BANCO = [
  { value: "", label: "Sem banco" },
  ...BANCOS.map((b) => ({ value: b.slug, label: b.label })),
];
