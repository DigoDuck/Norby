import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
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
 * A cota, a sequência e o status de cada dia saem SEMPRE da janela inteira
 * (RITMO_MAX_WEEKS). A largura só decide quantas semanas aparecem. Antes a
 * largura entrava no cálculo, e o mesmo dia estourava no desktop e ficava no
 * ritmo no celular: número que muda com a tela não é número em que se confia.
 *
 * @param {Array} transactions  lançamentos das últimas RITMO_MAX_WEEKS semanas
 */
export default function RitmoCard({ transactions, erro = false }) {
  const gridRef = useRef(null);
  const [semanas, setSemanas] = useState(6);

  // Layout effect: mede ANTES da pintura. Com useEffect o primeiro quadro saía
  // com 6 colunas esticadas no card largo, e os quadrados piscavam gigantes.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    setSemanas(weeksThatFit(el.clientWidth, FIT));
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) =>
      setSemanas(weeksThatFit(entry.contentRect.width, FIT)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [erro]);

  const ritmo = useMemo(
    () => computeRitmo(transactions, windowDays(RITMO_MAX_WEEKS), new Date()),
    [transactions],
  );
  const dias = Math.min(windowDays(semanas), ritmo.cells.length);
  const visiveis = ritmo.cells.slice(-dias);
  const noRitmo = visiveis.filter((c) => c.onPace).length;
  const { weeks, months } = heatGrid(visiveis);
  const hoje = ritmo.cells.at(-1)?.key;

  return (
    <div className="xl:col-span-7 panel p-6 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-content">Ritmo financeiro</h2>
          <p className="text-xs text-content-2 mt-0.5">
            {!ritmo.hasActivity
              ? "Registre lançamentos para acompanhar seu ritmo"
              : !ritmo.hasPace
                ? "Registre uma receita para calcular seu ritmo"
                : `${noRitmo} dos últimos ${dias} dias no seu ritmo`}
          </p>
        </div>
        {/* Só a partir de 3 dias: sequência curta vira cobrança, não prêmio */}
        {ritmo.hasPace && ritmo.streak >= 3 && (
          <span className="chip bg-accent/10 text-accent">
            <Flame size={12} aria-hidden="true" /> {ritmo.streak} dias seguidos
          </span>
        )}
      </div>

      {erro ? (
        <p className="m-auto py-10 text-xs text-content-3 text-center">
          Não conseguimos carregar todos os seus lançamentos, então o ritmo
          ficaria errado. Recarregue a página para tentar de novo.
        </p>
      ) : (
        <>
        {/* role=img + resumo: o `title` de cada célula é invisível para teclado e
            ignorado por boa parte dos leitores de tela, então o painel inteiro só
            existia para quem usa mouse e enxerga. */}
        <div
          ref={gridRef}
          role="img"
          aria-label={
            ritmo.hasPace
              ? `${noRitmo} dos últimos ${dias} dias dentro do seu ritmo de gasto diário`
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
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-auto pt-4 text-xs text-content-3">
        {/* A cota é o que dá sentido a "no ritmo": dita em número, com a
            regra no hover. */}
        <span
          title="Dia no ritmo é o dia em que você gastou até a cota. A cota é a sua receita dos últimos seis meses dividida pelos dias."
        >
          {ritmo.hasPace ? `Cota de ${formatBRL(ritmo.dailyPace)} por dia` : `Últimos ${dias} dias`}
          {/* O title só existe para quem usa mouse: a regra vai também em texto. */}
          {ritmo.hasPace && (
            <span className="sr-only">
              . Dia no ritmo é o dia em que você gastou até a cota; a cota é a sua receita dos últimos seis meses dividida pelos dias.
            </span>
          )}
        </span>
        {/* Cada cor dita pelo que é: sem lançamento, folga crescente, estouro. */}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="heat-cell size-2.5 shrink-0" style={{ backgroundColor: heatColor(1) }} />
            Sem lançamento
          </span>
          <span className="flex items-center gap-1">
            Folga: pouca
            {[2, 3, 4].map((level) => (
              <span
                key={level}
                className="heat-cell size-2.5 shrink-0"
                style={{ backgroundColor: heatColor(level) }}
              />
            ))}
            muita
          </span>
          <span className="flex items-center gap-1.5">
            <span className="heat-cell size-2.5 shrink-0" style={{ backgroundColor: heatColor("over") }} />
            Estourou
          </span>
        </span>
      </div>
    </div>
  );
}
