import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign, CreditCard, TrendingUp, Plus, BrainCircuit } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
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

const COLORS = ["#2DB5A3", "#6FD4C6", "#5FBF7E", "#1F8C7E", "#E06A4A"];

const tooltipStyle = {
  background: "#0E1B19",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 12,
  color: "#EFFAF8",
};
const axisTick = { fill: "rgba(239,250,248,0.45)", fontSize: 12 };

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

  // Categorias de despesa DO MÊS atual
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-norby-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const fmt = (v) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const insightItems = insight?.summary_text?.split("|") || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-norby-ivory/50 text-sm">Bem-vindo de volta</p>
          <h1 className="text-2xl font-bold text-norby-ivory mt-0.5 tracking-tight">
            Dashboard
          </h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            Acompanhe seus gastos, metas e recomendações da IA
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/transactions")}
            className="border-white/10 text-norby-ivory/70 hover:text-norby-ivory hover:bg-white/5"
          >
            Buscar
          </Button>
          <Button
            onClick={() => navigate("/transactions")}
            className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium shadow-lg shadow-norby-teal/20"
          >
            <Plus size={16} /> Novo Lançamento
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="Saldo atual" value={fmt(totalBalance)} icon={DollarSign} />
        <KpiCard
          title="Gastos do mês"
          value={fmt(monthExpenses)}
          change={expensesChange}
          icon={CreditCard}
        />
        <KpiCard
          title="Receitas do mês"
          value={fmt(monthIncome)}
          change={incomeChange}
          icon={TrendingUp}
        />
        <KpiCard
          title="Score da IA"
          value={`${insight?.score ?? "-"}/100`}
          icon={BrainCircuit}
          accent="bg-norby-teal-soft/15 text-norby-teal-soft"
        />
      </div>

      {/* Fluxo de Caixa + Leitura da IA */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-5 col-span-2">
          <h2 className="font-semibold text-norby-ivory mb-1">Fluxo de Caixa</h2>
          <p className="text-xs text-norby-ivory/50 mb-4">
            Comparativo entre entradas e saídas
          </p>
          {cashFlowData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-norby-ivory/40 text-sm">
              Nenhuma transação registrada ainda
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cashFlowData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis dataKey="month" stroke="rgba(255,255,255,0.10)" tick={axisTick} />
                <YAxis stroke="rgba(255,255,255,0.10)" tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
                <Line
                  type="monotone"
                  dataKey="Entradas"
                  stroke="#5FBF7E"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Saídas"
                  stroke="#2DB5A3"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Leitura da IA */}
        <div className="glass-card p-5 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold text-norby-ivory">Leitura da IA</h2>
            <p className="text-xs text-norby-ivory/50">
              Resumo automático do seu comportamento financeiro
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
              <p className="text-xs font-semibold text-norby-teal mb-1 uppercase tracking-wider">
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
          <h2 className="font-semibold text-norby-ivory mb-1">Gastos por categoria</h2>
          <p className="text-xs text-norby-ivory/50 mb-4">
            Concentração dos principais custos no período
          </p>

          {categoryData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-norby-ivory/40 text-sm">
              Nenhuma despesa registrada ainda
            </div>
          ) : (
            <div className="flex gap-6 items-center">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={categoryData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="rgba(255,255,255,0.10)"
                      tick={{ fill: "rgba(239,250,248,0.55)", fontSize: 11 }}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      formatter={(value) => [fmt(value), "Total"]}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      stroke="none"
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [fmt(value), "Total"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className="glass-card p-5 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold text-norby-ivory">Movimentações Recentes</h2>
            <p className="text-xs text-norby-ivory/50">
              Últimos lançamentos registrados
            </p>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            {transactions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-norby-ivory/40 text-xs text-center">
                Nenhuma movimentação ainda
              </div>
            ) : (
              transactions.slice(0, 4).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-norby-ivory">
                      {t.category}
                    </p>
                    <p className="text-xs text-norby-ivory/40">
                      {new Date(t.date).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold tnum ${
                        t.type === "INCOME" ? "text-norby-income" : "text-norby-ivory"
                      }`}
                    >
                      {t.type === "INCOME" ? "+" : "-"} {fmt(parseFloat(t.amount))}
                    </p>
                    <p
                      className={`text-xs ${
                        t.type === "EXPENSE" ? "text-norby-danger" : "text-norby-income"
                      }`}
                    >
                      {t.type === "EXPENSE" ? "Variável" : "Fixo"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-white/[0.03]">
              <p className="text-xs text-norby-ivory/40">Saldo do mês</p>
              <p className="text-sm font-bold text-norby-ivory mt-1 tnum">
                {fmt(monthNet)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-norby-teal/10 border border-norby-teal/20">
              <p className="text-xs text-norby-teal">Maior gasto</p>
              <p className="text-sm font-bold text-norby-ivory mt-1">
                {categoryData[0]?.name || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
