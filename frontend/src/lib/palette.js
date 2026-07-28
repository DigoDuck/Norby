import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./categories";

// Séries de gráfico como referência de token, não hex: o recharts recebe isso
// como atributo de apresentação SVG e o navegador resolve a var — a mesma
// string serve para os dois temas.
export const CHART_SERIES = [
  "rgb(var(--chart-1))",
  "rgb(var(--chart-2))",
  "rgb(var(--chart-3))",
  "rgb(var(--chart-4))",
  "rgb(var(--chart-5))",
  "rgb(var(--chart-6))",
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

// Categorias conhecidas ganham posição fixa na paleta, o que garante que as
// mais frequentes não colidam entre si. Histórico e categorias fora da lista
// caem no hash, que é determinístico mas pode repetir cor.
const KNOWN = new Map(
  [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((name, i) => [
    normalize(name),
    CHART_SERIES[i % CHART_SERIES.length],
  ]),
);

export function colorForCategory(name) {
  const key = normalize(name);
  return KNOWN.get(key) ?? CHART_SERIES[hashIndex(key, CHART_SERIES.length)];
}
