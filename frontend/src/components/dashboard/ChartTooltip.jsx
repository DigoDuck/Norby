import { formatBRL } from "@/lib/utils";

// Tooltip escuro reutilizável, formatado em R$
export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-surface-inset border border-line/10 px-3 py-2 shadow-xl">
      {label && (
        <p className="text-[11px] font-medium text-content-2 mb-1 capitalize">
          {label}
        </p>
      )}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: p.color || p.payload?.fill }}
          />
          <span className="text-content-2">{p.name}</span>
          <span className="ml-auto font-semibold text-content tnum">
            {formatBRL(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
