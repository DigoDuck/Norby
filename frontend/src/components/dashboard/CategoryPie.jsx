import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { colorForCategory } from "@/lib/palette";
import { formatBRL } from "@/lib/utils";
import ChartTooltip from "./ChartTooltip";

/**
 * Painel "Onde vai seu dinheiro": pizza do top-5 de despesas do mês + legenda.
 *
 * A legenda não é enfeite: com 9 categorias, algumas cores vizinhas se
 * confundem para daltônicos (ver --chart-* no index.css), então nome, % e
 * valor ficam sempre visíveis ao lado da cor.
 *
 * @param {{ name: string, value: number }[]} data  maior fatia primeiro
 * @param {number} total  soma das fatias (para os percentuais)
 */
export default function CategoryPie({ data, total }) {
  return (
    <div className="lg:col-span-5 panel p-6">
      <div>
        <h2 className="font-semibold text-content">Onde vai seu dinheiro</h2>
        <p className="text-xs text-content-2 mt-0.5">
          <span className="capitalize">
            {new Date().toLocaleDateString("pt-BR", { month: "long" })}
          </span>
          {total > 0 && <span className="tnum"> · {formatBRL(total)} no total</span>}
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-[150px] text-content-3 text-xs text-center px-4">
          Registre despesas para ver a distribuição por categoria
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 mt-5">
          <div className="w-[176px] h-[176px] shrink-0 self-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* Pizza cheia, começando às 12h no sentido horário. O traço
                    da cor do card separa fatias vizinhas sem depender da cor. */}
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="rgb(var(--surface))"
                  strokeWidth={data.length > 1 ? 2 : 0}
                  isAnimationActive={false}
                >
                  {data.map((c) => (
                    <Cell key={c.name} fill={colorForCategory(c.name)} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} cursor={false} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Duas linhas por item: em uma só, nome + valor + % não cabem ao
              lado da pizza e "Contas & Serviços" truncava. */}
          <ul className="flex-1 flex flex-col gap-2 min-w-0">
            {data.map((c) => {
              const pct = total ? Math.round((c.value / total) * 100) : 0;
              return (
                <li key={c.name} className="flex items-center gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: colorForCategory(c.name) }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs text-content-2 truncate">{c.name}</span>
                    <span className="block text-[11px] text-content-3 tnum">
                      {formatBRL(c.value)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-content tnum">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
