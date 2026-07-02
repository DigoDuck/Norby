import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Minus,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Target,
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
import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { aiApi } from "@/api/ai";
import { goalsApi } from "@/api/goals";
import { recurringApi } from "@/api/recurring";
import { dashboardApi } from "@/api/dashboard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import NorthStar from "@/components/shared/NorthStar";
import AiOrb from "@/components/shared/AiOrb";
import { useAuthStore } from "@/store/authStore";
import { formatDateBR, formatBRL } from "@/lib/utils";

// Rótulo curto pt-BR de uma chave ano-mês ("2026-07" → "jul"), em horário local.
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("pt-BR", { month: "short" });
};

const EMPTY_SUMMARY = {
  month_income: 0,
  month_expenses: 0,
  prev_month_income: 0,
  prev_month_expenses: 0,
  cash_flow: [],
  top_categories: [],
};

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

const fmtShort = (v) =>
  Number(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`;

// Janela do heatmap "Ritmo financeiro" (dias, terminando hoje)
const STREAK_DAYS = 42;

const pad2 = (n) => String(n).padStart(2, "0");
const dayKey = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Meses (1-12/ano) que a janela de N dias terminando hoje atravessa.
function monthsForWindow(days) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

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
            {formatBRL(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Valor monetário grande com centavos rebaixados ("R$ 8.240" + ",50")
function MoneyHero({ value }) {
  const formatted = formatBRL(value);
  const idx = formatted.lastIndexOf(",");
  return (
    <span className="tnum tracking-tight">
      <span className="text-4xl font-semibold text-norby-ivory">
        {formatted.slice(0, idx)}
      </span>
      <span className="text-2xl font-semibold text-norby-ivory/50">
        {formatted.slice(idx)}
      </span>
    </span>
  );
}

export default function Dashboard() {
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [insight, setInsight] = useState(null);
  const [goals, setGoals] = useState([]);
  const [streakTx, setStreakTx] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState("all");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  useEffect(() => {
    async function loadData() {
      await recurringApi.run().catch(() => {}); // materializa recorrências vencidas
      const streakMonths = monthsForWindow(STREAK_DAYS);
      // allSettled: falha de um painel (ex.: IA) não derruba os demais
      const [wRes, tRes, sRes, iRes, gRes, ...streakRes] =
        await Promise.allSettled([
          walletsApi.list(),
          transactionsApi.list(),
          dashboardApi.summary(),
          aiApi.getInsight(),
          goalsApi.list(),
          ...streakMonths.map((m) =>
            transactionsApi.list({ month: m.month, year: m.year, limit: 500 }),
          ),
        ]);
      if (wRes.status === "fulfilled") setWallets(wRes.value.data);
      if (tRes.status === "fulfilled") setTransactions(tRes.value.data);
      if (sRes.status === "fulfilled") setSummary(sRes.value.data);
      if (iRes.status === "fulfilled") setInsight(iRes.value.data);
      if (gRes.status === "fulfilled") setGoals(gRes.value.data);
      setStreakTx(
        streakRes
          .filter((r) => r.status === "fulfilled")
          .flatMap((r) => r.value.data),
      );
      setLoading(false);
    }
    loadData();
  }, []);

  const pctChange = (curr, prev) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : undefined;

  // Saldo = soma das carteiras (estado real) ou da carteira filtrada
  const totalBalance = wallets.reduce((s, w) => s + parseFloat(w.balance), 0);
  const shownBalance =
    selectedWallet === "all"
      ? totalBalance
      : parseFloat(wallets.find((w) => w.id === selectedWallet)?.balance ?? 0);

  // KPIs, fluxo e categorias vêm agregados do backend (sobre TODAS as transações,
  // sem o cap de 200 da listagem). O front só formata para os gráficos.
  const s = summary || EMPTY_SUMMARY;
  const monthIncome = parseFloat(s.month_income);
  const monthExpenses = parseFloat(s.month_expenses);
  const monthNet = monthIncome - monthExpenses;

  // Variação do saldo total vs. fim do mês anterior (derivável do resultado do
  // mês corrente). Só faz sentido na visão "todas as carteiras".
  const prevBalance = totalBalance - monthNet;
  const balanceChange =
    selectedWallet === "all" ? pctChange(totalBalance, prevBalance) : undefined;

  const cashFlowData = s.cash_flow.map((p) => ({
    key: p.month,
    month: monthLabel(p.month),
    Entradas: parseFloat(p.income),
    Saídas: parseFloat(p.expenses),
  }));

  const categoryData = s.top_categories.map((c) => ({
    name: c.category,
    value: parseFloat(c.total),
  }));
  const categoryTotal = categoryData.reduce((sum, c) => sum + c.value, 0);
  const topCategoryPct = categoryTotal
    ? Math.round((categoryData[0]?.value / categoryTotal) * 100)
    : 0;

  // ── Ritmo financeiro: 42 dias, "no azul" = receitas ≥ despesas no dia ──
  const { streakCells, streakCount, hasStreakActivity } = useMemo(() => {
    const byDay = new Map();
    for (const t of streakTx) {
      const key = String(t.date).slice(0, 10);
      const amt = parseFloat(t.amount);
      byDay.set(key, (byDay.get(key) || 0) + (t.type === "INCOME" ? amt : -amt));
    }
    const today = new Date();
    const cells = [];
    for (let i = STREAK_DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = dayKey(d);
      const net = byDay.get(key) ?? 0;
      cells.push({ key, net, active: byDay.has(key), blue: net >= 0 });
    }
    let count = 0;
    for (let i = cells.length - 1; i >= 0 && cells[i].blue; i--) count++;
    return {
      streakCells: cells,
      streakCount: count,
      hasStreakActivity: byDay.size > 0,
    };
  }, [streakTx]);

  const maxPositiveNet = Math.max(
    1,
    ...streakCells.filter((c) => c.net > 0).map((c) => c.net),
  );

  // Intensidade do heatmap: teal escala com o resultado do dia; vermelho = dia
  // negativo; neutro = dia sem lançamento (conta como azul para a sequência).
  function cellClass(cell) {
    if (!cell.active) return "bg-white/[0.06]";
    if (!cell.blue) return "bg-norby-danger/60";
    const ratio = cell.net / maxPositiveNet;
    if (ratio > 0.66) return "bg-norby-teal";
    if (ratio > 0.33) return "bg-norby-teal/70";
    if (cell.net > 0) return "bg-norby-teal/40";
    return "bg-norby-teal/20"; // dia ativo com resultado zero
  }

  // ── Meta em destaque: a SAVINGS mais próxima de concluir ──
  const featuredGoal = goals
    .filter((g) => g.type === "SAVINGS")
    .sort((a, b) => b.progress_pct - a.progress_pct)[0];
  const goalPct = featuredGoal
    ? Math.min(100, Math.round(featuredGoal.progress_pct))
    : 0;

  const firstName = user?.name?.split(" ")[0] || "";
  const todayLabel = new Date()
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })
    .replace(".", "");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <NorthStar size={32} className="text-norby-teal star-loading" />
      </div>
    );
  }

  const insightItems = insight?.summary_text?.split("|") || [];

  const walletOptions = [
    { value: "all", label: "Todas as carteiras" },
    ...wallets.map((w) => ({ value: w.id, label: w.name })),
  ];

  // Atalho: abre o form de Relatórios já com o tipo pré-selecionado
  const newTransaction = (type) =>
    navigate("/transactions", { state: { newType: type } });

  return (
    <div className="space-y-5">
      {/* ── Linha 1: hero + saldo total ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5">
        {/* Hero: saudação + convite à IA */}
        <div
          className="relative overflow-hidden rounded-3xl p-7 flex flex-col animate-fade-up"
          style={{
            background:
              "linear-gradient(130deg, #156358 0%, #2DB5A3 48%, #6FD4C6 115%)",
          }}
        >
          {/* Círculos decorativos, como no rascunho aprovado */}
          <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full bg-white/[0.08] pointer-events-none" />
          <div className="absolute right-20 bottom-[-70px] w-44 h-44 rounded-full bg-norby-night/[0.08] pointer-events-none" />

          <span className="relative inline-flex items-center gap-1.5 w-fit rounded-full bg-norby-night/20 px-3 py-1 text-[11px] font-semibold text-norby-night uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-norby-night/70" />
            {todayLabel}
          </span>

          <h1 className="relative text-3xl font-bold text-norby-night mt-4 tracking-tight">
            Olá, {firstName} 👋
          </h1>
          <p className="relative text-sm text-norby-night/70 mt-1.5 max-w-xs leading-relaxed">
            Pergunte qualquer coisa sobre suas finanças — a Norby está pronta.
          </p>

          <div className="relative mt-auto pt-6">
            <Button
              onClick={() => navigate("/ai")}
              className="bg-norby-night text-norby-ivory hover:bg-norby-night/85"
            >
              Falar com a Norby <ArrowRight size={15} />
            </Button>
          </div>
        </div>

        {/* Saldo total */}
        <div className="glass-card p-6 flex flex-col gap-4 animate-fade-up">
          <div className="flex items-center justify-between gap-3">
            <span className="microlabel">Saldo total</span>
            {wallets.length > 1 && (
              <div className="w-48 shrink-0">
                <Select
                  id="wallet-filter"
                  value={selectedWallet}
                  options={walletOptions}
                  onChange={(v) => setSelectedWallet(v || "all")}
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <MoneyHero value={shownBalance} />
              <span className="text-xs font-medium text-norby-ivory/40">BRL</span>
            </div>
            {balanceChange !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <span className={balanceChange >= 0 ? "chip-pos" : "chip-neg"}>
                  {balanceChange >= 0 ? (
                    <ArrowUpRight size={12} />
                  ) : (
                    <ArrowDownRight size={12} />
                  )}
                  {Math.abs(balanceChange).toFixed(1)}%
                </span>
                <span className="text-xs text-norby-ivory/40">
                  vs. mês passado
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => newTransaction("INCOME")}
              className="flex-1 bg-norby-teal text-norby-night hover:bg-norby-teal-soft font-medium shadow-lg shadow-norby-teal/20"
            >
              <Plus size={15} /> Receita
            </Button>
            <Button
              onClick={() => newTransaction("EXPENSE")}
              variant="outline"
              className="flex-1 border-white/10 bg-white/[0.03] text-norby-ivory hover:bg-white/[0.08]"
            >
              <Minus size={15} /> Despesa
            </Button>
          </div>

          <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06] pt-4 mt-auto">
            <div className="pr-3">
              <p className="microlabel">Receitas</p>
              <p className="text-sm font-semibold text-norby-income tnum mt-1">
                {formatBRL(monthIncome)}
              </p>
            </div>
            <div className="px-3">
              <p className="microlabel">Despesas</p>
              <p className="text-sm font-semibold text-norby-ivory tnum mt-1">
                {formatBRL(monthExpenses)}
              </p>
            </div>
            <div className="pl-3">
              <p className="microlabel">Score IA</p>
              <p className="text-sm font-semibold text-norby-teal-soft tnum mt-1">
                {insight?.score ?? "—"}/100
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Linha 2: categorias + ritmo + meta ──────────────────────── */}
      <div className="grid grid-cols-3 gap-5">
        {/* Onde vai seu dinheiro */}
        <div className="glass-card p-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-norby-ivory">
                Onde vai seu dinheiro
              </h2>
              <p className="text-xs text-norby-ivory/50 mt-0.5 capitalize">
                {new Date().toLocaleDateString("pt-BR", { month: "long" })}
                {categoryTotal > 0 && (
                  <span className="tnum"> · {formatBRL(categoryTotal)}</span>
                )}
              </p>
            </div>
          </div>

          {categoryData.length === 0 ? (
            <div className="flex items-center justify-center h-[170px] text-norby-ivory/40 text-xs text-center px-4">
              Registre despesas para ver a distribuição por categoria
            </div>
          ) : (
            <div className="flex items-center gap-5 mt-4">
              <div className="relative w-[128px] h-[128px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={62}
                      paddingAngle={categoryData.length > 1 ? 3 : 0}
                      cornerRadius={4}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {categoryData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} cursor={false} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-norby-ivory/40 uppercase tracking-wider">
                    Maior
                  </span>
                  <span className="text-lg font-bold text-norby-ivory tnum">
                    {topCategoryPct}%
                  </span>
                </div>
              </div>

              {/* Legenda: cor + categoria + % (valor no tooltip do donut) */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                {categoryData.map((c, i) => {
                  const pct = categoryTotal
                    ? Math.round((c.value / categoryTotal) * 100)
                    : 0;
                  return (
                    <div key={c.name} className="flex items-center gap-2.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          background: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                        }}
                      />
                      <span className="text-xs text-norby-ivory/80 flex-1 truncate">
                        {c.name}
                      </span>
                      <span className="text-xs font-semibold text-norby-ivory tnum">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Ritmo financeiro (streak de dias no azul) */}
        <div className="glass-card p-6 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-norby-ivory">Ritmo financeiro</h2>
              <p className="text-xs text-norby-ivory/50 mt-0.5">
                {hasStreakActivity
                  ? `${streakCount} ${streakCount === 1 ? "dia" : "dias"} no azul seguidos`
                  : "Registre lançamentos para acompanhar seu ritmo"}
              </p>
            </div>
            {hasStreakActivity && streakCount > 0 && (
              <span className="chip bg-norby-teal/15 text-norby-teal">
                <Flame size={12} /> {streakCount}
              </span>
            )}
          </div>

          <div
            className="grid gap-1.5 mt-5"
            style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
          >
            {streakCells.map((cell) => (
              <div
                key={cell.key}
                title={`${formatDateBR(cell.key)} · ${
                  cell.active ? formatBRL(cell.net) : "sem lançamentos"
                }`}
                className={`aspect-square rounded-[4px] ${cellClass(cell)}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-auto pt-4">
            <span className="text-[11px] text-norby-ivory/40">
              Últimos {STREAK_DAYS} dias
            </span>
            <span className="flex items-center gap-1 text-[11px] text-norby-ivory/40">
              Menos
              <span className="w-2.5 h-2.5 rounded-[3px] bg-norby-teal/20" />
              <span className="w-2.5 h-2.5 rounded-[3px] bg-norby-teal/40" />
              <span className="w-2.5 h-2.5 rounded-[3px] bg-norby-teal/70" />
              <span className="w-2.5 h-2.5 rounded-[3px] bg-norby-teal" />
              Mais
            </span>
          </div>
        </div>

        {/* Meta em destaque */}
        <div className="glass-card p-6 flex flex-col">
          {featuredGoal ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-norby-income/15 text-norby-income flex items-center justify-center shrink-0">
                  <Target size={17} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-norby-ivory truncate">
                    {featuredGoal.name}
                  </h2>
                  <p className="text-xs text-norby-ivory/50">meta ativa</p>
                </div>
              </div>

              <div className="mt-5">
                <p className="tnum tracking-tight">
                  <span className="text-2xl font-semibold text-norby-ivory">
                    {formatBRL(featuredGoal.current_amount)}
                  </span>
                  <span className="text-sm font-medium text-norby-ivory/40">
                    {" "}/ {formatBRL(featuredGoal.target_amount)}
                  </span>
                </p>
                <div
                  role="progressbar"
                  aria-valuenow={goalPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 rounded-full bg-white/[0.06] mt-3 overflow-hidden"
                >
                  <div
                    className="h-full rounded-full bg-norby-income transition-all duration-500"
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
                <p className="text-xs text-norby-ivory/50 mt-2 tnum">
                  {goalPct}% concluído
                </p>
              </div>

              <Button
                onClick={() => navigate("/goals")}
                variant="outline"
                className="mt-auto w-full border-norby-income/25 bg-transparent text-norby-income hover:bg-norby-income/10"
              >
                Ver todas as metas <ArrowRight size={14} />
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-norby-income/15 text-norby-income flex items-center justify-center shrink-0">
                  <Target size={17} />
                </div>
                <h2 className="font-semibold text-norby-ivory">Metas</h2>
              </div>
              <p className="text-xs text-norby-ivory/50 leading-relaxed mt-4 flex-1">
                Crie uma meta de reserva para acompanhar o progresso dela aqui
                no painel.
              </p>
              <Button
                onClick={() => navigate("/goals")}
                variant="outline"
                className="mt-4 w-full border-norby-income/25 bg-transparent text-norby-income hover:bg-norby-income/10"
              >
                Criar uma meta <ArrowRight size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Linha 3: fluxo de caixa + leitura da IA ─────────────────── */}
      <div className="grid grid-cols-3 gap-5">
        <div className="glass-card p-6 col-span-2">
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
        <div className="glass-card p-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <AiOrb size={34} />
            <div>
              <h2 className="font-semibold text-norby-ivory">Leitura da IA</h2>
              <p className="text-xs text-norby-ivory/50">
                Resumo do seu comportamento financeiro
              </p>
            </div>
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

      {/* ── Linha 4: movimentações recentes + resumo do mês ─────────── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-norby-ivory">
              Movimentações Recentes
            </h2>
            <p className="text-xs text-norby-ivory/50">
              Últimos lançamentos registrados
            </p>
          </div>
          <Button
            onClick={() => navigate("/transactions")}
            variant="ghost"
            size="sm"
            className="text-norby-ivory/60 hover:text-norby-ivory hover:bg-white/5"
          >
            Ver todas <ArrowRight size={13} />
          </Button>
        </div>

        <div className="flex gap-6">
          <div className="flex-1 flex flex-col min-w-0">
            {transactions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-norby-ivory/40 text-xs text-center py-8">
                Nenhuma movimentação ainda — use “+ Receita” ou “− Despesa” para
                começar
              </div>
            ) : (
              transactions.slice(0, 5).map((t) => {
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
                          {formatDateBR(t.date)}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`text-sm font-semibold tnum shrink-0 ${
                        isIncome ? "text-norby-income" : "text-norby-ivory"
                      }`}
                    >
                      {isIncome ? "+" : "−"} {formatBRL(parseFloat(t.amount))}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="w-60 shrink-0 flex flex-col gap-2">
            <div className="p-4 rounded-2xl bg-white/[0.03]">
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
                {formatBRL(monthNet)}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-norby-teal/10 border border-norby-teal/20">
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
