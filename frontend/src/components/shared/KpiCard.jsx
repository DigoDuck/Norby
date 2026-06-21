export default function KpiCard({ title, value, change, icon: Icon, accent }) {
  const hasChange = change !== undefined;
  const isPositive = change >= 0;

  return (
    <div className="group rounded-2xl bg-norby-surface/70 border border-white/[0.06] p-5 flex flex-col gap-3 transition-colors duration-200 hover:border-white/[0.14]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-norby-ivory/40 uppercase tracking-wider">
          {title}
        </span>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            accent || "bg-norby-teal/10 text-norby-teal"
          }`}
        >
          {Icon && <Icon size={16} />}
        </div>
      </div>
      <p className="text-2xl font-semibold text-norby-ivory tracking-tight tnum">
        {value}
      </p>
      {hasChange && (
        <p
          className={`text-xs font-medium flex items-center gap-1 tnum ${
            isPositive ? "text-norby-income" : "text-norby-danger"
          }`}
        >
          {isPositive ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs. mês anterior
        </p>
      )}
    </div>
  );
}
