import { formatBRL, formatDateBR } from "@/lib/utils";
import { heatGrid, heatLevel } from "@/lib/ritmo";

// Intensidade do heatmap: escala sequencial própria (--heat-*), nunca a paleta
// categórica da pizza — reusá-la aqui faria o painel parecer que codifica
// categoria, quando codifica intensidade. Regra dos níveis em lib/ritmo.js.
const heatColor = (level) =>
  level === "over" ? "rgb(var(--heat-over))" : `rgb(var(--heat-${level}))`;

// Rótulo só em seg/qua/sex, como no GitHub: sete rótulos empilhados viram ruído.
const DIAS = ["", "Seg", "", "Qua", "", "Sex", ""];

// Linha do mês + 7 dias de 12px, como no GitHub: rótulos e semanas usam a
// mesma grade, senão "Seg" deixa de alinhar com a linha da segunda-feira.
const ROWS = "grid grid-rows-[1rem_repeat(7,0.75rem)] gap-[3px]";

/**
 * Painel "Ritmo financeiro": dias dentro da cota diária, com streak como bônus.
 *
 * @param {ReturnType<import("@/lib/ritmo").computeRitmo>} ritmo
 * @param {number} dias  tamanho da janela (só para os rótulos)
 */
export default function RitmoCard({ ritmo, dias }) {
  const { weeks, months } = heatGrid(ritmo.cells);
  const hoje = ritmo.cells.at(-1)?.key;

  return (
    <div className="lg:col-span-3 panel p-6 flex flex-col">
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
        role="img"
        aria-label={
          ritmo.hasPace
            ? `${ritmo.onPaceCount} dos últimos ${dias} dias dentro do seu ritmo de gasto diário`
            : `Sem ritmo calculado nos últimos ${dias} dias`
        }
        className="flex gap-[3px] mt-4 self-start"
      >
        <div className={`${ROWS} pr-1.5 text-[11px] leading-3 text-content-3`}>
          <span />
          {DIAS.map((dia, i) => (
            <span key={i}>{dia}</span>
          ))}
        </div>

        {weeks.map((week, c) => (
          <div key={c} className={ROWS}>
            <span className="text-[11px] leading-4 text-content-3 whitespace-nowrap">
              {months[c]}
            </span>
            {week.map((cell, r) =>
              cell ? (
                <div
                  key={cell.key}
                  title={`${formatDateBR(cell.key)} · ${
                    cell.active
                      ? `${formatBRL(cell.spent)} de ${formatBRL(ritmo.dailyPace)}`
                      : "sem lançamentos"
                  }`}
                  style={{ backgroundColor: heatColor(heatLevel(cell, ritmo.dailyPace)) }}
                  className={`heat-cell size-3 ${
                    cell.key === hoje
                      ? "ring-1 ring-accent ring-offset-1 ring-offset-surface"
                      : ""
                  }`}
                />
              ) : (
                <div key={`vazio-${r}`} />
              ),
            )}
          </div>
        ))}
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
