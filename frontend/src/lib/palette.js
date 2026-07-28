import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./categories";

// Séries de gráfico como referência de token, não hex: o recharts recebe isso
// como atributo de apresentação SVG e o navegador resolve a var (verificado no
// browser) — a mesma string serve para os dois temas.
//
// São 9 porque existem 9 categorias de despesa e o donut do dashboard mostra o
// top-5 do mês. Como o top-5 muda de mês para mês e a cor tem que ser estável
// por categoria, qualquer par de despesas pode dividir a mesma rosca: com menos
// de 9 cores, duas fatias vizinhas saem idênticas.
export const CHART_SERIES = [
  "rgb(var(--chart-1))",
  "rgb(var(--chart-2))",
  "rgb(var(--chart-3))",
  "rgb(var(--chart-4))",
  "rgb(var(--chart-5))",
  "rgb(var(--chart-6))",
  "rgb(var(--chart-7))",
  "rgb(var(--chart-8))",
  "rgb(var(--chart-9))",
];

// Mesmo hash que Wallets já usava para o chip da carteira. Determinístico e
// estável entre sessões, sem depender de ordem nem de id — o backend manda só
// o nome da categoria (ver dashboard_service.py › CategorySlice).
export function hashIndex(name, len) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % len;
}

const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// Categorias conhecidas ganham posição fixa na paleta. As despesas vêm
// primeiro e ocupam as 9 cores sem repetir; as receitas continuam a contagem e
// voltam a repetir a partir do início, o que é inofensivo porque despesa e
// receita nunca dividem o mesmo gráfico. Categorias históricas ou fora da lista
// caem no hash: determinístico, mas pode repetir cor.
// "Outros" existe nas duas listas: indexar pela posição bruta faria a entrada
// de receita sobrescrever a de despesa e jogar "Outros" em cima de "Lazer".
// O índice avança só quando a chave é nova.
const KNOWN = new Map();
for (const name of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
  const key = normalize(name);
  if (!KNOWN.has(key)) {
    KNOWN.set(key, CHART_SERIES[KNOWN.size % CHART_SERIES.length]);
  }
}

export function colorForCategory(name) {
  const key = normalize(name);
  return KNOWN.get(key) ?? CHART_SERIES[hashIndex(key, CHART_SERIES.length)];
}
