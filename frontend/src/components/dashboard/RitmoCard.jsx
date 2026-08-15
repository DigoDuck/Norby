import { formatBRL, formatDateBR } from "@/lib/utils";
import { headroom } from "@/lib/ritmo";

// Intensidade do heatmap: escala sequencial própria (--heat-*), nunca a paleta
// categórica do donut — reusá-la aqui faria o painel parecer que codifica
// categoria, quando codifica intensidade. 4 = folga total, 2 = raspou a cota,
// over = estourou, 0 = dia sem lançamento. Nota: o nível 1 nunca é produzido,
// por isso a legenda pinta [0, 2, 3, 4].
function heatLevel(cell, dailyPace) {
  if (!cell.active) return 0;
  if (!cell.onPace) return "over";
  const folga = headroom(cell, dailyPace);
  if (folga > 0.66) return 4;
  if (folga > 0.33) return 3;
  return 2;
}

const heatColor = (level) =>
  level === "over" ? "rgb(var(--heat-over))" : `rgb(var(--heat-${level}))`;

const heatGlow = (level) =>
  level === "over" || level >= 3
    ? { boxShadow: `0 0 12px -2px ${heatColor(level)}` }
    : undefined;

/**
 * Painel "Ritmo financeiro": dias dentro da cota diária, com streak como bônus.
 *
 * @param {ReturnType<import("@/lib/ritmo").computeRitmo>} ritmo
 * @param {number} dias  tamanho da janela (só para os rótulos)
 */
export default function RitmoCard({ ritmo, dias }) {
  return (
    <div className="lg:col-span-5 glass p-6 flex flex-col">
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
        className="grid gap-1 mt-4"
        style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
      >
        {ritmo.cells.map((cell, i) => {
          const level = heatLevel(cell, ritmo.dailyPace);
          return (
            <div
              key={cell.key}
              title={`${formatDateBR(cell.key)} · ${
                cell.active
                  ? `${formatBRL(cell.spent)} de ${formatBRL(ritmo.dailyPace)}`
                  : "sem lançamentos"
              }`}
              style={{ backgroundColor: heatColor(level), ...heatGlow(level) }}
              className={`heat-cell ${
                i === ritmo.cells.length - 1
                  ? "ring-1 ring-accent ring-offset-1 ring-offset-surface"
                  : ""
              }`}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-auto pt-4">
        <span className="text-[11px] text-content-3">Últimos {dias} dias</span>
        <span className="flex items-center gap-1 text-[11px] text-content-3">
          Menos
          {[0, 2, 3, 4].map((level) => (
            <span
              key={level}
              className="heat-cell w-2.5 h-2.5 shrink-0"
              style={{ backgroundColor: heatColor(level) }}
            />
          ))}
          Mais
        </span>
      </div>
    </div>
  );
}
