import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { colorForCategory } from "@/lib/palette";
import { formatBRL } from "@/lib/utils";
import ChartTooltip from "./ChartTooltip";

/**
 * Painel "Onde vai seu dinheiro": rosca do top-5 de despesas do mês + legenda.
 *
 * @param {{ name: string, value: number }[]} data
 * @param {number} total  soma das fatias (para os percentuais)
 */
export default function CategoryDonut({ data, total }) {
  const maiorFatiaPct = total ? Math.round((data[0]?.value / total) * 100) : 0;

  return (
            <div className="lg:col-span-4 glass p-6">
        <div>
          <h2 className="font-semibold text-content">
            Onde vai seu dinheiro
          </h2>
          <p className="text-xs text-content-2 mt-0.5">
            <span className="capitalize">
              {new Date().toLocaleDateString("pt-BR", { month: "long" })}
            </span>
            {total > 0 && (
              <span className="tnum"> · {formatBRL(total)} no total</span>
            )}
          </p>
        </div>

        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[150px] text-content-3 text-xs text-center px-4">
            Registre despesas para ver a distribuição por categoria
          </div>
        ) : (
          <div className="flex items-center gap-5 mt-4">
            <div className="relative w-[128px] h-[128px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={62}
                    paddingAngle={data.length > 1 ? 3 : 0}
                    cornerRadius={6}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {data.map((c) => (
                      <Cell key={c.name} fill={colorForCategory(c.name)} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-content-3 uppercase tracking-widest">
                  Maior
                </span>
                <span className="text-[15px] font-semibold text-accent tnum mt-0.5">
                  {maiorFatiaPct}%
                </span>
              </div>
            </div>

            {/* Legenda: quadradinho de cor + categoria + % (valor no tooltip) */}
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              {data.map((c) => {
                const pct = total
                  ? Math.round((c.value / total) * 100)
                  : 0;
                return (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-2 h-2 rounded-[3px] shrink-0"
                      style={{ background: colorForCategory(c.name) }}
                    />
                    <span className="text-content-2 flex-1 truncate">
                      {c.name}
                    </span>
                    <span className="text-content-2 tnum">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
  );
}
