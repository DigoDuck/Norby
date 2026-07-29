export default function KpiCard({
  title,
  value,
  suffix,
  change,
  changeInverted,
  icon: Icon,
  accent,
}) {
  const hasChange = change !== undefined;
  const rising = change >= 0;
  // Para "Gastos", subir é ruim → inverte a semântica de cor (não o ícone)
  const isGood = changeInverted ? !rising : rising;

  return (
    <div className="group rounded-2xl bg-surface border border-line/[0.08] p-5 flex flex-col gap-3 transition-colors duration-200 hover:border-line/[0.16]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-content-3 uppercase tracking-wider">
          {title}
        </span>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            accent || "bg-accent/10 text-accent"
          }`}
        >
          {Icon && <Icon size={16} />}
        </div>
      </div>
      <p className="text-2xl font-semibold text-content tracking-tight tnum">
        {value}
        {suffix && (
          <span className="text-sm font-medium text-content-3 ml-0.5">
            {suffix}
          </span>
        )}
      </p>
      {hasChange && (
        <p
          className={`text-xs font-medium flex items-center gap-1 tnum ${
            isGood ? "text-income" : "text-danger"
          }`}
        >
          {rising ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs. mês anterior
        </p>
      )}
    </div>
  );
}
