import { useEffect, useMemo, useRef, useState } from "react";
import { formatBRL, formatDateBR } from "@/lib/utils";
import { computeRitmo, heatGrid, heatLevel, weeksThatFit, windowDays } from "@/lib/ritmo";

// Intensidade do heatmap: escala sequencial própria (--heat-*), nunca a paleta
// categórica da pizza — reusá-la aqui faria o painel parecer que codifica
// categoria, quando codifica intensidade. Regra dos níveis em lib/ritmo.js.
const heatColor = (level) =>
  level === "over" ? "rgb(var(--heat-over))" : `rgb(var(--heat-${level}))`;

// Rótulo só em seg/qua/sex, como no GitHub: sete rótulos empilhados viram ruído.
const DIAS = ["", "Seg", "", "Qua", "", "Sex", ""];

// Quantos lançamentos o dashboard busca para o painel: meio ano.
export const RITMO_MAX_WEEKS = 26;

// Quadrado de ~30px, o tamanho dos 14x3 de antes. A grade cresce em semanas até
// preencher a largura; a célula nunca estica.
const FIT = { cell: 30, gap: 4, label: 30, min: 4, max: RITMO_MAX_WEEKS };

/**
 * Painel "Ritmo financeiro": dias dentro da cota diária, com streak como bônus.
 *
 * O tamanho da janela vem da largura: cabem N semanas de quadrados de ~30px,
 * então são N semanas (de um domingo até hoje) que entram no cálculo e na frase.
 *
 * @param {Array} transactions  lançamentos das últimas RITMO_MAX_WEEKS semanas
 */
export default function RitmoCard({ transactions }) {
  const gridRef = useRef(null);
  const [semanas, setSemanas] = useState(6);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) =>
      setSemanas(weeksThatFit(entry.contentRect.width, FIT)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dias = windowDays(semanas);
  const ritmo = useMemo(
    () => computeRitmo(transactions, dias, new Date()),
    [transactions, dias],
  );
  const { weeks, months } = heatGrid(ritmo.cells);
  const hoje = ritmo.cells.at(-1)?.key;

  return (
    <div className="lg:col-span-7 panel p-6 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-content">Ritmo financeiro</h2>
          <p className="text-xs text-content-2 mt-0.5">
            {!ritmo.hasActivity
              ? "Registre lançamentos para acompanhar seu ritmo"
              : !ritmo.hasPace
                ? "Registre uma receita para calcular seu ritmo"
                : `${ritmo.onPaceCount} dos últimos ${dias} dias no seu ritmo`}
          </p>
        </div>
        {/* Só a partir de 3 dias: sequência curta vira cobrança, não prêmio */}
        {ritmo.hasPace && ritmo.streak >= 3 && (
          <span className="chip bg-accent/15 text-accent">🔥 {ritmo.streak}</span>
        )}
      </div>

      {/* role=img + resumo: o `title` de cada célula é invisível para teclado e
          ignorado por boa parte dos leitores de tela, então o painel inteiro só
          existia para quem usa mouse e enxerga. */}
      <div
        ref={gridRef}
        role="img"
        aria-label={
          ritmo.hasPace
            ? `${ritmo.onPaceCount} dos últimos ${dias} dias dentro do seu ritmo de gasto diário`
            : `Sem ritmo calculado nos últimos ${dias} dias`
        }
        // Uma grade só, coluna a coluna: rótulo dos dias + uma coluna por
        // semana. Como o número de semanas vem da largura, o 1fr de cada
        // coluna fica perto dos 30px e a célula sai quadrada.
        className="grid grid-flow-col gap-1 mt-4"
        style={{
          gridTemplateRows: "auto repeat(7, auto)",
          gridTemplateColumns: `auto repeat(${weeks.length}, minmax(0, 1fr))`,
        }}
      >
        <span />
        {DIAS.map((dia, i) => (
          <span
            key={i}
            className="self-center pr-1.5 text-[11px] leading-none text-content-3"
          >
            {dia}
          </span>
        ))}

        {weeks.map((week, c) => [
          <span
            key={`mes-${c}`}
            className="pb-0.5 text-[11px] leading-4 text-content-3 whitespace-nowrap"
          >
            {months[c]}
          </span>,
          // Sempre 7 casas por coluna, mesmo na última semana (que termina em
          // hoje): o fluxo por coluna depende disso para alinhar as linhas.
          ...Array.from({ length: 7 }, (_, r) => {
            const cell = week[r];
            return cell ? (
              <div
                key={cell.key}
                title={`${formatDateBR(cell.key)} · ${
                  cell.active
                    ? `${formatBRL(cell.spent)} de ${formatBRL(ritmo.dailyPace)}`
                    : "sem lançamentos"
                }`}
                style={{ backgroundColor: heatColor(heatLevel(cell, ritmo.dailyPace)) }}
                className={`heat-cell w-full aspect-square ${
                  cell.key === hoje
                    ? "ring-1 ring-accent ring-offset-1 ring-offset-surface"
                    : ""
                }`}
              />
            ) : (
              <div key={`vazio-${c}-${r}`} />
            );
          }),
        ])}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-auto pt-4 text-[11px] text-content-3">
        <span>Últimos {dias} dias</span>
        <span className="flex items-center gap-1">
          Menos
          {[1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className="heat-cell size-2.5 shrink-0"
              style={{ backgroundColor: heatColor(level) }}
            />
          ))}
          Mais
          <span
            className="heat-cell size-2.5 shrink-0 ml-2"
            style={{ backgroundColor: heatColor("over") }}
          />
          Estourou
        </span>
      </div>
    </div>
  );
}
