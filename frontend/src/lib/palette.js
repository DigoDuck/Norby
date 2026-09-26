// Séries de gráfico como referência de token, não hex: o recharts recebe isso
// como atributo de apresentação SVG e o navegador resolve a var (verificado no
// browser) — a mesma string serve para os dois temas.
//
// Hoje colore só o chip de carteira sem banco (Wallets.jsx), escolhido pelo
// hash do nome para ser estável entre sessões.
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
