import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Plus,
  BrainCircuit,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import KpiCard from "@/components/shared/KpiCard";
import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { aiApi } from "@/api/ai";
import { Button } from "@/components/ui/button";

// Paleta categórica de hues distintos (resolve o "2 cores parecidas" do donut)
const CATEGORY_COLORS = [
  "#2DB5A3", // teal
  "#5B8DEF", // azul
  "#E0B341", // dourado
  "#E0725C", // coral
  "#7BD88F", // verde
  "#6FD4C6", // teal-soft (reserva p/ 6ª categoria)
];

const INCOME_COLOR = "#5FBF7E";
const EXPENSE_COLOR = "#E0725C";

const axisTick = { fill: "rgba(239,250,248,0.40)", fontSize: 11 };

const fmt = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const fmtShort = (v) =>
  Number(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`;

// Tooltip escuro reutilizável, formatado em R$
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-norby-surface2/95 backdrop-blur-md border border-white/10 px-3 py-2 shadow-xl">
      {label && (
        <p className="text-[11px] font-medium text-norby-ivory/50 mb-1 capitalize">
          {label}
        </p>
      )}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: p.color || p.payload?.fill }}
          />
          <span className="text-norby-ivory/70">{p.name}</span>
          <span className="ml-auto font-semibold text-norby-ivory tnum">
            {fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadData() {
      // allSettled: falha da IA (insight) não derruba wallets/transactions
      const [wRes, tRes, iRes] = await Promise.allSettled([
        walletsApi.list(),
        transactionsApi.list(),
        aiApi.getInsight(),
      ]);
      if (wRes.status === "fulfilled") setWallets(wRes.value.data);
      if (tRes.status === "fulfilled") setTransactions(tRes.value.data);
      if (iRes.status === "fulfilled") setInsight(iRes.value.data);
      setLoading(false);
    }
    loadData();
  }, []);

  // --- Recortes de tempo: mês atual e mês anterior ---
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();
  const prevDate = new Date(curY, curM - 1, 1);
  const prevY = prevDate.getFullYear();
  const prevM = prevDate.getMonth();

  const inMonth = (dateStr, y, m) => {
    const d = new Date(dateStr);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  const sumBy = (list, type) =>
    list
      .filter((t) => t.type === type)
      .reduce((s, t) => s + parseFloat(t.amount), 0);
  const pctChange = (curr, prev) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : undefined;

  // Saldo atual = soma das carteiras (estado real, não recorte de mês)
  const totalBalance = wallets.reduce((s, w) => s + parseFloat(w.balance), 0);

  // KPIs do MÊS atual + variação real vs mês anterior
  const monthTx = transactions.filter((t) => inMonth(t.date, curY, curM));
  const prevTx = transactions.filter((t) => inMonth(t.date, prevY, prevM));
  const monthIncome = sumBy(monthTx, "INCOME");
  const monthExpenses = sumBy(monthTx, "EXPENSE");
  const incomeChange = pctChange(monthIncome, sumBy(prevTx, "INCOME"));
  const expensesChange = pctChange(monthExpenses, sumBy(prevTx, "EXPENSE"));
  const monthNet = monthIncome - monthExpenses;

  // Fluxo de caixa: agrupa por ANO-MÊS (não mistura anos), ordena e pega os últimos 6
  const cashFlowData = (() => {
    const map = {};
    transactions.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[key]) {
        map[key] = {
          key,
          month: d.toLocaleString("pt-BR", { month: "short" }),
          Entradas: 0,
          Saídas: 0,
        };
      }
      if (t.type === "INCOME") map[key].Entradas += parseFloat(t.amount);
      if (t.type === "EXPENSE") map[key].Saídas += parseFloat(t.amount);
    });
    return Object.values(map)
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6);
  })();

  // Categorias de despesa DO MÊS atual (já ordenado desc → maior fatia às 12h)
  const categoryData = Object.values(
    monthTx
      .filter((t) => t.type === "EXPENSE")
      .reduce((acc, t) => {
        const key = t.category;
        if (!acc[key]) acc[key] = { name: key, value: 0 };
        acc[key].value += parseFloat(t.amount);
        return acc;
      }, {}),
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const categoryTotal = categoryData.reduce((s, c) => s + c.value, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-norby-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const insightItems = insight?.summary_text?.split("|") || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-norby-ivory/50 text-sm">Bem-vindo de volta</p>
          <h1 className="text-2xl font-bold text-norby-ivory mt-0.5 tracking-tight">
            Dashboard
          </h1>
        </div>
        <Button
          onClick={() => navigate("/transactions")}
          className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium shadow-lg shadow-norby-teal/20"
        >
          <Plus size={16} /> Novo Lançamento
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="Saldo atual" value={fmt(totalBalance)} icon={DollarSign} />
        <KpiCard
          title="Receitas do mês"
          value={fmt(monthIncome)}
          change={incomeChange}
          icon={TrendingUp}
        />
        <KpiCard
          title="Gastos do mês"
          value={fmt(monthExpenses)}
          change={expensesChange}
          changeInverted
          icon={CreditCard}
        />
        <KpiCard
          title="Score da IA"
          value={`${insight?.score ?? "—"}`}
          suffix="/100"
          icon={BrainCircuit}
          accent="bg-norby-teal-soft/15 text-norby-teal-soft"
        />
      </div>

      {/* Fluxo de Caixa + Leitura da IA */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-5 col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-norby-ivory">Fluxo de Caixa</h2>
              <p className="text-xs text-norby-ivory/50 mt-0.5">
                Entradas e saídas dos últimos meses
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-norby-ivory/60">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: INCOME_COLOR }}
                />
                Entradas
              </span>
              <span className="flex items-center gap-1.5 text-norby-ivory/60">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: EXPENSE_COLOR }}
                />
                Saídas
              </span>
            </div>
          </div>
          {cashFlowData.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-norby-ivory/40 text-sm">
              Nenhuma transação registrada ainda
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={cashFlowData}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                  className="capitalize"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                  tickFormatter={fmtShort}
                  width={48}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="Entradas"
                  stroke={INCOME_COLOR}
                  strokeWidth={2.5}
                  fill="url(#gIncome)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="Saídas"
                  stroke={EXPENSE_COLOR}
                  strokeWidth={2.5}
                  fill="url(#gExpense)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Leitura da IA */}
        <div className="glass-card p-5 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold text-norby-ivory">Leitura da IA</h2>
            <p className="text-xs text-norby-ivory/50">
              Resumo do seu comportamento financeiro
            </p>
          </div>
          {insightItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-norby-ivory/40 text-xs text-center">
              Adicione transações para gerar sua análise de IA
            </div>
          ) : (
            <div className="flex flex-col gap-2 flex-1">
              {insightItems.map((item, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-white/[0.03] text-xs text-norby-ivory/80 leading-relaxed"
                >
                  {item.trim()}
                </div>
              ))}
            </div>
          )}

          {insight?.suggested_action && (
            <div className="p-3 rounded-xl bg-norby-teal/10 border border-norby-teal/20">
              <p className="text-[11px] font-semibold text-norby-teal mb-1 uppercase tracking-wider">
                Sugestão prática
              </p>
              <p className="text-xs text-norby-ivory/80">
                {insight.suggested_action}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Gastos por categoria + Movimentações Recentes */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-5 col-span-2">
          <h2 className="font-semibold text-norby-ivory">Gastos por categoria</h2>
          <p className="text-xs text-norby-ivory/50 mb-4">
            Distribuição das despesas do mês
          </p>

          {categoryData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-norby-ivory/40 text-sm">
              Nenhuma despesa registrada ainda
            </div>
          ) : (
            <div className="flex items-center gap-8">
              {/* Donut com total no centro */}
              <div className="relative w-[200px] h-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={66}
                      outerRadius={92}
                      paddingAngle={categoryData.length > 1 ? 3 : 0}
                      cornerRadius={4}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={false}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] text-norby-ivory/40 uppercase tracking-wider">
                    Total
                  </span>
                  <span className="text-lg font-bold text-norby-ivory tnum">
                    {fmt(categoryTotal)}
                  </span>
                </div>
              </div>

              {/* Legenda-lista: cor + categoria + valor + % (fallback de acessibilidade) */}
              <div className="flex-1 flex flex-col gap-2.5">
                {categoryData.map((c, i) => {
                  const pct = categoryTotal
                    ? (c.value / categoryTotal) * 100
                    : 0;
                  return (
                    <div key={c.name} className="flex items-center gap-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background:
                            CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                        }}
                      />
                      <span className="text-sm text-norby-ivory/80 flex-1 truncate">
                        {c.name}
                      </span>
                      <span className="text-sm font-semibold text-norby-ivory tnum">
                        {fmt(c.value)}
                      </span>
                      <span className="text-xs text-norby-ivory/40 tnum w-9 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="glass-card p-5 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold text-norby-ivory">
              Movimentações Recentes
            </h2>
            <p className="text-xs text-norby-ivory/50">
              Últimos lançamentos registrados
            </p>
          </div>

          <div className="flex flex-col gap-1 flex-1">
            {transactions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-norby-ivory/40 text-xs text-center">
                Nenhuma movimentação ainda
              </div>
            ) : (
              transactions.slice(0, 4).map((t) => {
                const isIncome = t.type === "INCOME";
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isIncome
                            ? "bg-norby-income/15 text-norby-income"
                            : "bg-norby-danger/15 text-norby-danger"
                        }`}
                      >
                        {isIncome ? (
                          <ArrowUpRight size={16} />
                        ) : (
                          <ArrowDownRight size={16} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-norby-ivory truncate">
                          {t.category}
                        </p>
                        <p className="text-xs text-norby-ivory/40">
                          {new Date(t.date).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`text-sm font-semibold tnum shrink-0 ${
                        isIncome ? "text-norby-income" : "text-norby-ivory"
                      }`}
                    >
                      {isIncome ? "+" : "−"} {fmt(parseFloat(t.amount))}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-white/[0.03]">
              <p className="text-xs text-norby-ivory/40">Saldo do mês</p>
              <p
                className={`text-sm font-bold mt-1 tnum flex items-center gap-1 ${
                  monthNet >= 0 ? "text-norby-income" : "text-norby-danger"
                }`}
              >
                {monthNet >= 0 ? (
                  <TrendingUp size={13} />
                ) : (
                  <TrendingDown size={13} />
                )}
                {fmt(monthNet)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-norby-teal/10 border border-norby-teal/20">
              <p className="text-xs text-norby-teal">Maior gasto</p>
              <p className="text-sm font-bold text-norby-ivory mt-1 truncate">
                {categoryData[0]?.name || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
