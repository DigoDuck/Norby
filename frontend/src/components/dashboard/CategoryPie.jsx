import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatBRL, formatPct } from "@/lib/utils";
import ChartTooltip from "./ChartTooltip";

// Cor pela posição da fatia (maior primeiro), num matiz só: a cor mostra o
// peso, e quem diz a categoria é a legenda, sempre visível ao lado.
const pieColor = (i) => `rgb(var(--pie-${Math.min(i, 4) + 1}))`;
// "Demais categorias" é o resto, não uma categoria: fica em cinza, por último.
const sliceColor = (c, i) => (c.resto ? "rgb(var(--chart-9))" : pieColor(i));

/**
 * Painel "Onde vai seu dinheiro": pizza das despesas do mês por categoria,
 * legenda com barra de participação e um rodapé com três números do mês.
 *
 * @param {{ name: string, value: number, resto?: boolean }[]} data  maior fatia primeiro
 * @param {number} total  despesas do mês (as fatias já incluem o resto)
 * @param {{ mediaDiaria: number, diasDecorridos: number,
 *           maiorGasto: { amount: string, description?: string, category: string } | null,
 *           variacao?: number }} destaques
 */
export default function CategoryPie({ data, total, destaques }) {
  return (
    <div className="pie-card xl:col-span-5 panel p-6 flex flex-col">
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
        <div className="flex flex-1 items-center justify-center min-h-[150px] text-content-3 text-xs text-center px-4">
          Registre despesas para ver a distribuição por categoria
        </div>
      ) : (
        <>
          <div className="pie-body flex flex-1 flex-col gap-5 mt-5">
            {/* Fora do Tab e do leitor de tela: a legenda ao lado diz cada
                categoria com valor e porcentagem em texto. A pizza focável e
                sem nome era parada vazia para quem navega por teclado. */}
            <div aria-hidden="true" className="size-36 shrink-0 self-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer={false}>
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
                    rootTabIndex={-1}
                    stroke="rgb(var(--surface))"
                    strokeWidth={data.length > 1 ? 2 : 0}
                    isAnimationActive={false}
                  >
                    {data.map((c, i) => (
                      <Cell key={c.name} fill={sliceColor(c, i)} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Duas linhas por item: nome e % em cima, barra e valor embaixo.
                O valor tem largura fixa para todas as barras terem a mesma
                trilha: trilhas de tamanhos diferentes fariam a comparação
                mentir. */}
            <ul className="flex-1 flex flex-col gap-3 min-w-0">
              {data.map((c, i) => {
                const pct = total ? Math.round((c.value / total) * 100) : 0;
                return (
                  <li key={c.name} className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: sliceColor(c, i) }}
                      />
                      <span className="flex-1 truncate text-xs text-content-2" title={c.name}>
                        {c.name}
                      </span>
                      <span className="text-sm font-medium text-content tnum">{pct}%</span>
                    </div>
                    <div className="mt-1.5 ml-5 flex items-center gap-3">
                      <div className="h-1 flex-1 rounded-full bg-line/[0.07] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: sliceColor(c, i) }}
                        />
                      </div>
                      <span className="w-[4.75rem] shrink-0 text-right text-[11px] text-content-3 tnum">
                        {formatBRL(c.value)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {destaques && (
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-x-3 gap-y-4 mt-6 pt-4 border-t border-line/[0.08]">
              <div className="min-w-0 text-center">
                <dt className="text-xs text-content-3">Média por dia</dt>
                <dd className="mt-1 text-sm font-semibold text-content tnum">
                  {formatBRL(destaques.mediaDiaria)}
                </dd>
                <dd className="text-[11px] text-content-3">
                  em {destaques.diasDecorridos} {destaques.diasDecorridos === 1 ? "dia" : "dias"}
                </dd>
              </div>
              <div className="min-w-0 text-center">
                <dt className="text-xs text-content-3">Maior lançamento</dt>
                <dd className="mt-1 text-sm font-semibold text-content tnum">
                  {destaques.maiorGasto ? formatBRL(destaques.maiorGasto.amount) : "—"}
                </dd>
                <dd className="truncate text-[11px] text-content-3">
                  {destaques.maiorGasto
                    ? destaques.maiorGasto.description || destaques.maiorGasto.category
                    : "sem despesas"}
                </dd>
              </div>
              <div className="min-w-0 text-center">
                <dt className="text-xs text-content-3">Vs. mês passado</dt>
                {destaques.variacao === undefined ? (
                  <dd className="mt-1 text-sm font-semibold text-content-3">—</dd>
                ) : (
                  // Despesa que sobe é notícia ruim: vermelho na alta, verde na queda.
                  <dd
                    className={`mt-1 flex items-center justify-center gap-1 text-sm font-semibold tnum ${
                      destaques.variacao > 0 ? "text-expense" : "text-income"
                    }`}
                  >
                    {destaques.variacao > 0 ? (
                      <ArrowUpRight size={14} aria-hidden="true" />
                    ) : (
                      <ArrowDownRight size={14} aria-hidden="true" />
                    )}
                    {formatPct(destaques.variacao, 0)}
                  </dd>
                )}
                <dd className="text-[11px] text-content-3">nas despesas</dd>
              </div>
            </dl>
          )}
        </>
      )}
    </div>
  );
}
