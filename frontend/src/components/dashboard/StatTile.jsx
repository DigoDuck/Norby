import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPct } from "@/lib/utils";

/**
 * Tile de KPI: rótulo + ícone num círculo, número grande e a variação contra o
 * mês passado. `highlight` pinta o tile com o acento: é o ponto focal do
 * dashboard, então só um tile por tela recebe.
 *
 * @param {number} [delta]  variação em %, ou undefined quando não há base
 * @param {boolean} [upIsGood=true]  false para despesa: subir é ruim
 */
export default function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  upIsGood = true,
  hint = "vs. mês passado",
  note = "este mês",
  highlight = false,
}) {
  const good = delta === undefined || (upIsGood ? delta >= 0 : delta <= 0);
  const chip = highlight
    ? "chip bg-accent-contrast/15 text-accent-contrast"
    : good
      ? "chip-pos"
      : "chip-neg";

  return (
    <div
      className={`rounded-2xl p-4 flex flex-col gap-3 min-w-0 ${
        highlight
          ? "bg-accent-fill text-accent-contrast"
          : "bg-surface-inset border border-line/[0.06] text-content"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`text-sm font-medium ${highlight ? "" : "text-content-2"}`}
        >
          {label}
        </span>
        <span
          aria-hidden="true"
          className={`grid place-items-center size-8 shrink-0 rounded-full ${
            highlight
              ? "bg-accent-contrast/15"
              : "bg-surface border border-line/[0.08] text-content-2"
          }`}
        >
          <Icon size={15} />
        </span>
      </div>

      {/* Sem truncate: valor cortado ("R$ 6.200,…") é pior que valor que
          quebra linha. Em tela estreita a fonte desce um degrau. */}
      <p className="text-xl sm:text-2xl font-semibold tnum tracking-tight break-words">{value}</p>

      <div className="flex items-center gap-2 text-[11px]">
        {delta !== undefined && (
          <span className={chip}>
            {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {formatPct(delta, 0)}
          </span>
        )}
        <span className={highlight ? "" : "text-content-3"}>
          {delta !== undefined ? hint : note}
        </span>
      </div>
    </div>
  );
}
