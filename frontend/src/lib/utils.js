import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Formata uma data de calendário (ISO vinda da API) como dd/mm/aaaa.
 *
 * A data de uma transação é um DIA de calendário, não um instante. A API
 * devolve um datetime com fuso (timestamptz, ex.: "2026-06-30T00:00:00Z").
 * Usar `new Date(...).toLocaleDateString()` converteria a meia-noite UTC
 * para o fuso local — em UTC-3 (Brasil) o dia 30 vira 29. Por isso lemos
 * direto a parte da data (YYYY-MM-DD), sem qualquer conversão de fuso.
 */
export function formatDateBR(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Converte uma data de calendário (ISO da API) num Date em horário LOCAL.
 *
 * Para agrupar/filtrar transações por mês precisamos de um Date, mas
 * `new Date("2026-07-01")` é interpretado como meia-noite UTC — em UTC-3
 * (Brasil) `.getMonth()` devolve o mês anterior. Aqui lemos ano/mês/dia da
 * string e construímos o Date já em horário local, sem qualquer conversão de
 * fuso (mesmo cuidado de `formatDateBR`). Retorna null para entrada vazia.
 */
export function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Parte de data (YYYY-MM-DD) de um ISO da API, para inputs type="date". */
export function toDateInput(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

/** Data de hoje (YYYY-MM-DD) em horário LOCAL, para inputs type="date". */
export function todayInput() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Formata um valor (número ou string decimal) como moeda pt-BR: "R$ 1.234,56". */
export const formatBRL = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

/**
 * Classe base dos inputs "cheios" dos formulários (input nativo, não o <Input>
 * do shadcn, que tem estilo próprio). Compartilhada por Goals/Recurring/Transactions.
 */
export const inputCls =
  "w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-norby-ivory text-sm placeholder:text-norby-ivory/40 focus:outline-none focus:ring-2 focus:ring-norby-teal/40 transition";
