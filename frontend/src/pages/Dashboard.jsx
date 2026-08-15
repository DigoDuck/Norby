import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Minus,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Check,
  Sparkles,
  CalendarDays,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
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
import { dashboardApi } from "@/api/dashboard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import NorthStar from "@/components/shared/NorthStar";
import AiOrb from "@/components/shared/AiOrb";
import InsightCard from "@/components/dashboard/InsightCard";
import RitmoCard from "@/components/dashboard/RitmoCard";
import Money from "@/components/shared/Money";
import HeroRing from "@/components/shared/HeroRing";
import { useAuthStore } from "@/store/authStore";
import { formatDateBR, formatBRL, parseDateOnly } from "@/lib/utils";
import { colorForCategory } from "@/lib/palette";
import { emojiForCategory } from "@/lib/categories";
import { computeRitmo } from "@/lib/ritmo";

// Rótulo curto pt-BR de uma chave ano-mês ("2026-07" → "jul"), em horário local.
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("pt-BR", { month: "short" });
};

const EMPTY_SUMMARY = {
  month_income: 0,
  month_expenses: 0,
  cash_flow: [],
  top_categories: [],
};

const INCOME_COLOR = "rgb(var(--income))";
const EXPENSE_COLOR = "rgb(var(--expense))";

const axisTick = { fill: "rgb(var(--axis))", fontSize: 11 };

// "Hoje" / "Ontem" / "N dias atrás" / dd/mm/aaaa — para as movimentações.
function relativeDay(value) {
  const d = parseDateOnly(value);
  if (!d) return "";
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((startOfToday - d) / 86_400_000);
  if (diff <= 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff < 7) return `${diff} dias atrás`;
  return formatDateBR(value);
}

// Janela do heatmap "Ritmo financeiro" (dias, terminando hoje)
const STREAK_DAYS = 42;

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
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    async function loadData() {
      const streakMonths = monthsForWindow(STREAK_DAYS);
      // allSettled: falha de um painel (ex.: IA) não derruba os demais
      const [wRes, tRes, sRes, iRes, gRes, ...streakRes] =
        await Promise.allSettled([
          walletsApi.list(),
          transactionsApi.list({ limit: 5 }),
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
  const categoryMax = Math.max(1, ...categoryData.map((c) => c.value));
  const topCategoryPct = categoryTotal
    ? Math.round((categoryData[0]?.value / categoryTotal) * 100)
    : 0;

  // Ponto de fim de linha do fluxo de caixa (detalhe do rascunho aprovado)
  const endDot = (color) =>
    function EndDot({ cx, cy, index }) {
      if (index !== cashFlowData.length - 1) return <g key={index} />;
      return (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={4.5}
          fill="rgb(var(--surface))"
          stroke={color}
          strokeWidth={2.5}
        />
      );
    };

  // ── Ritmo financeiro: 42 dias, "no ritmo" = gasto do dia abaixo da cota ──
  // Regra e testes em lib/ritmo.js.
  const ritmo = useMemo(
    () => computeRitmo(streakTx, STREAK_DAYS, new Date()),
    [streakTx],
  );


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
  // "julho de 2026" → "Julho de 2026" (capitalize do CSS pegaria o "De" também)
  const rawMonthYear = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const monthYearLabel =
    rawMonthYear.charAt(0).toUpperCase() + rawMonthYear.slice(1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <NorthStar size={32} className="text-accent star-loading" />
      </div>
    );
  }

  const walletOptions = [
    { value: "all", label: "Todas as carteiras" },
    ...wallets.map((w) => ({ value: w.id, label: w.name })),
  ];

  // Atalho: abre o form de Relatórios já com o tipo pré-selecionado
  const newTransaction = (type) =>
    navigate("/transactions", { state: { newType: type } });

  return (
    <div className="space-y-4">
      {/* ── Linha contextual: a data, sozinha, à esquerda ────────────── */}
      <div className="flex items-center">
        <span className="control-raised inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-content-2 uppercase tracking-widest">
          <CalendarDays size={13} className="text-accent" />
          {todayLabel}
        </span>
      </div>

      {/* ── Linha 1: hero (7 col) + saldo total (5 col) ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Hero: saudação + convite à IA + anel da marca */}
        <section className="hero-card lg:col-span-7 relative overflow-hidden glass p-6 md:pr-[250px] flex items-center min-h-[228px] animate-fade-up">
          <div className="hero-card__content min-w-0">
            <h1 className="text-3xl font-bold text-content tracking-tight">
              Olá, {firstName} 👋
            </h1>
            <p className="text-sm text-content-2 mt-2 max-w-sm leading-relaxed">
              Pergunte qualquer coisa sobre suas finanças — a Norby está pronta
              para te ajudar hoje.
            </p>
            <Button
              onClick={() => navigate("/ai")}
              className="hero-cta mt-5 h-11 min-w-[208px] justify-between px-6 font-medium"
            >
              Falar com a Norby
              <span className="hero-cta__sep" aria-hidden="true" />
              <NorthStar size={14} />
            </Button>
          </div>

          <HeroRing className="hidden md:block" />
        </section>

        {/* Saldo total */}
        <section className="lg:col-span-5 glass p-6 flex flex-col gap-4 animate-fade-up">
          <div className="relative flex items-center justify-between gap-3">
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

          <div className="relative">
            <div className="flex items-baseline gap-2">
              <Money
                value={shownBalance}
                className="tracking-tight text-4xl font-semibold text-content"
                centsClassName="text-2xl font-semibold text-content-2"
              />
              <span className="text-xs font-medium text-content-3">BRL</span>
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
                <span className="text-xs text-content-3">vs. mês passado</span>
              </div>
            )}
          </div>

          {/* Duas pílulas tingidas, não um CTA sólido: na referência os dois
              atalhos têm o mesmo peso e carregam a cor do próprio fluxo. O
              sólido do painel é só o "Falar com a Norby". */}
          <div className="relative flex gap-2">
            <Button
              onClick={() => newTransaction("INCOME")}
              variant="ghost"
              className="flex-1 border-income/25 bg-income/[0.12] text-income hover:bg-income/[0.18] hover:text-income"
            >
              <Plus size={15} /> Receita
            </Button>
            <Button
              onClick={() => newTransaction("EXPENSE")}
              variant="ghost"
              className="flex-1 border-expense/25 bg-expense/[0.10] text-expense hover:bg-expense/[0.16] hover:text-expense"
            >
              <Minus size={15} /> Despesa
            </Button>
          </div>

          <div className="relative grid grid-cols-3 divide-x divide-line/[0.08] border-t border-dashed border-line/10 pt-4 mt-auto">
            <div className="pr-3">
              <p className="microlabel">Receitas</p>
              <p className="text-sm font-semibold text-income tnum mt-1">
                {formatBRL(monthIncome)}
              </p>
            </div>
            <div className="px-3">
              <p className="microlabel">Despesas</p>
              <p className="text-sm font-semibold text-expense tnum mt-1">
                {formatBRL(monthExpenses)}
              </p>
            </div>
            <div className="pl-3">
              <p className="microlabel">Score IA</p>
              <p className="text-sm font-semibold text-accent tnum mt-1">
                {insight?.score != null ? `${insight.score}/100` : "—"}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ── Linha 2: categorias + ritmo + meta ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Onde vai seu dinheiro */}
        <div className="lg:col-span-4 glass p-6">
          <div>
            <h2 className="font-semibold text-content">
              Onde vai seu dinheiro
            </h2>
            <p className="text-xs text-content-2 mt-0.5">
              <span className="capitalize">
                {new Date().toLocaleDateString("pt-BR", { month: "long" })}
              </span>
              {categoryTotal > 0 && (
                <span className="tnum"> · {formatBRL(categoryTotal)} no total</span>
              )}
            </p>
          </div>

          {categoryData.length === 0 ? (
            <div className="flex items-center justify-center h-[150px] text-content-3 text-xs text-center px-4">
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
                      innerRadius={46}
                      outerRadius={62}
                      paddingAngle={categoryData.length > 1 ? 3 : 0}
                      cornerRadius={6}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {categoryData.map((c) => (
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
                    {topCategoryPct}%
                  </span>
                </div>
              </div>

              {/* Legenda: quadradinho de cor + categoria + % (valor no tooltip) */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                {categoryData.map((c) => {
                  const pct = categoryTotal
                    ? Math.round((c.value / categoryTotal) * 100)
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

        <RitmoCard ritmo={ritmo} dias={STREAK_DAYS} />

        {/* Meta em destaque */}
        <div className="lg:col-span-3 relative overflow-hidden glass border-income/25 p-6 flex flex-col">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 15% 90%, rgb(var(--income) / 0.13), transparent 55%)",
            }}
          />
          {featuredGoal ? (
            <>
              <div className="relative flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-income/15 flex items-center justify-center shrink-0 text-base">
                  🎯
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-content truncate">
                    {featuredGoal.name}
                  </h2>
                  <p className="text-xs text-content-2">meta ativa</p>
                </div>
              </div>

              <div className="relative mt-4">
                <p className="tnum tracking-tight">
                  <span className="text-2xl font-semibold text-content">
                    {formatBRL(featuredGoal.current_amount)}
                  </span>
                  <span className="text-sm font-medium text-content-3">
                    {" "}/ {formatBRL(featuredGoal.target_amount)}
                  </span>
                </p>
                <div
                  role="progressbar"
                  aria-label={`Progresso da meta ${featuredGoal.name}`}
                  aria-valuenow={goalPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 rounded-full bg-line/[0.06] mt-3 overflow-hidden"
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${goalPct}%`,
                      background: "rgb(var(--income))",
                    }}
                  />
                </div>
                <p className="text-xs text-content-2 mt-2 tnum">
                  {goalPct}% concluído
                </p>
              </div>

              <Button
                onClick={() => navigate("/goals")}
                variant="outline"
                className="relative mt-auto w-full border-income/25 bg-income/[0.08] text-income hover:bg-income/[0.15]"
              >
                Ver todas as metas <ArrowRight size={14} />
              </Button>
            </>
          ) : (
            <>
              <div className="relative flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-income/15 flex items-center justify-center shrink-0 text-base">
                  🎯
                </div>
                <h2 className="font-semibold text-content">Metas</h2>
              </div>
              <p className="relative text-xs text-content-2 leading-relaxed mt-4 flex-1">
                Crie uma meta de reserva para acompanhar o progresso dela aqui
                no painel.
              </p>
              <Button
                onClick={() => navigate("/goals")}
                variant="ghost"
                className="w-full stroke-iris bg-transparent text-accent font-semibold hover:bg-accent/[0.06]"
              >
                Criar uma meta <ArrowRight size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Linha 3: fluxo de caixa + leitura da IA ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 glass p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-content">Fluxo de caixa</h2>
              <p className="text-xs text-content-2 mt-0.5">
                Entradas vs. saídas · últimos meses
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-content-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: INCOME_COLOR }}
                />
                Entradas
              </span>
              <span className="flex items-center gap-1.5 text-content-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: EXPENSE_COLOR }}
                />
                Saídas
              </span>
            </div>
          </div>
          {cashFlowData.length === 0 ? (
            <div className="flex items-center justify-center h-[230px] text-content-3 text-sm">
              Nenhuma transação registrada ainda
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart
                data={cashFlowData}
                margin={{ top: 12, right: 12, left: 12, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="rgb(var(--grid-line) / 0.08)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                  dy={8}
                  className="capitalize"
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: "rgb(var(--grid-line) / 0.18)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="Entradas"
                  stroke={INCOME_COLOR}
                  strokeWidth={2.6}
                  fill="url(#gIncome)"
                  dot={endDot(INCOME_COLOR)}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="Saídas"
                  stroke={EXPENSE_COLOR}
                  strokeWidth={2.6}
                  fill="url(#gExpense)"
                  dot={endDot(EXPENSE_COLOR)}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <InsightCard insight={insight} />
      </div>

      {/* ── Linha 4: gastos por categoria + movimentações recentes ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Gastos por categoria (barras) */}
        <div className="lg:col-span-6 glass p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-content">
              Gastos por categoria
            </h2>
            <span className="text-xs text-content-3">
              {monthYearLabel}
            </span>
          </div>

          {categoryData.length === 0 ? (
            <div className="flex items-center justify-center h-[150px] text-content-3 text-xs text-center px-4">
              Registre despesas para ver o ranking de categorias
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {categoryData.map((c, i) => {
                const width = Math.max(6, (c.value / categoryMax) * 92);
                const barOpacity = [1, 0.55, 0.45, 0.4, 0.35][i] ?? 0.3;
                return (
                  <div key={c.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] text-content-2">
                        {c.name}
                      </span>
                      <span
                        className={`text-[13px] tnum ${
                          i === 0
                            ? "font-semibold text-accent"
                            : "font-medium text-content-2"
                        }`}
                      >
                        {formatBRL(c.value)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-line/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${width}%`,
                          background: `rgb(var(--accent) / ${barOpacity})`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Movimentações recentes */}
        <div className="lg:col-span-6 glass p-6 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-content">
              Movimentações recentes
            </h2>
            <Button
              onClick={() => navigate("/transactions")}
              variant="ghost"
              size="sm"
              className="text-accent hover:text-accent hover:bg-accent/10"
            >
              Ver todas <ArrowRight size={13} />
            </Button>
          </div>

          <div className="flex flex-col flex-1">
            {transactions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-content-3 text-xs text-center py-8">
                Nenhuma movimentação ainda — use “+ Receita” ou “− Despesa”
                para começar
              </div>
            ) : (
              transactions.slice(0, 5).map((t) => {
                const isIncome = t.type === "INCOME";
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-2.5 border-b border-line/5 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-[10px] bg-surface-inset flex items-center justify-center shrink-0 text-base">
                        {emojiForCategory(t.category, t.type)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-content truncate">
                          {t.category}
                        </p>
                        <p className="text-xs text-content-3 truncate">
                          {relativeDay(t.date)}
                          {t.description && ` · ${t.description}`}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`text-[13px] tnum shrink-0 ${
                        isIncome
                          ? "font-semibold text-income"
                          : "font-medium text-content-2"
                      }`}
                    >
                      {isIncome ? "+" : "−"} {formatBRL(parseFloat(t.amount))}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
