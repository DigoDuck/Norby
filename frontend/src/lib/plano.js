/**
 * O preço aparece em dois lugares que o consumidor lê antes de decidir: o
 * cartão de plano, ao lado do botão de assinar, e os Termos de Uso.
 *
 * Ficam na mesma constante porque divergirem não é bug de manutenção, é
 * problema de consumo: o art. 31 do CDC exige informação de preço correta e
 * precisa, e duas telas do mesmo produto anunciando valores diferentes é
 * exatamente o que ele proíbe.
 *
 * A fonte da verdade continua sendo o Price do Stripe. Isto é a cópia que a
 * interface exibe, e ao mudar o valor lá o reajuste passa por aqui também.
 */
export const PRECO_MENSAL = "R$ 20,00";
