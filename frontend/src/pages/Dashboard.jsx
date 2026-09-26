import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Minus,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDownLeft,
  PiggyBank,
  Percent,
  Target,
  Search,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { aiApi } from "@/api/ai";
import { goalsApi } from "@/api/goals";
import { dashboardApi } from "@/api/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import NorthStar from "@/components/shared/NorthStar";
import { ThemeButton } from "@/components/shared/ThemeToggle";
import InsightCard from "@/components/dashboard/InsightCard";
import CategoryPie from "@/components/dashboard/CategoryPie";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import RitmoCard, { RITMO_MAX_WEEKS } from "@/components/dashboard/RitmoCard";
import StatTile from "@/components/dashboard/StatTile";
import Money from "@/components/shared/Money";
import WalletMark from "@/components/shared/WalletMark";
import { LoadError } from "@/components/shared/LoadState";
import { usePlano } from "@/lib/plan";
import { useAuthStore } from "@/store/authStore";
import { formatDateBR, formatBRL, parseDateOnly, formatSinal, formatPct, MENOS } from "@/lib/utils";
import CategoryIcon from "@/components/shared/CategoryIcon";

// "Boa noite, Diogo": a saudação acompanha o horário, sem emoji no título
// (o leitor de tela lia "Olá, Diogo, mão acenando").
function saudacao(agora = new Date()) {
  const h = agora.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

// Rótulo curto pt-BR de uma chave ano-mês ("2026-07" → "jul"), em horário local.
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("pt-BR", { month: "short" });
};

// Dica visual do atalho da busca, na grafia de cada sistema.
const TECLA_BUSCA = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ K" : "Ctrl K";

const EMPTY_SUMMARY = {
  month_income: 0,
  month_expenses: 0,
  cash_flow: [],
  top_categories: [],
};

// Centavos dos tiles: um degrau menor, como no saldo. No tile safira o branco
// fica a 85% (4,8:1): a 75% media 4,05:1, abaixo do mínimo para 18px.
const TILE_CENTS = "text-base sm:text-lg text-content-2";
const TILE_CENTS_ON_ACCENT = "text-base sm:text-lg text-accent-contrast/[0.85]";

const INCOME_COLOR = "rgb(var(--income))";
const EXPENSE_COLOR = "rgb(var(--expense))";

const axisTick = { fill: "rgb(var(--axis))", fontSize: 11 };

// Eixo Y do fluxo em valor compacto ("R$ 6 mil"): sem ele a curva mostrava a
// forma, mas não a escala.
const reaisCompacto = (v) =>
  `R$ ${Number(v).toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })}`;

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



export default function Dashboard() {
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [insight, setInsight] = useState(null);
  const [goals, setGoals] = useState([]);
  const [streakTx, setStreakTx] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState("all");
  const [busca, setBusca] = useState("");
  const buscaRef = useRef(null);

  // Ctrl K / Cmd K: o atalho de busca de quase todo app. O preventDefault tira
  // o do navegador, que manda o foco para a barra de endereço.
  useEffect(() => {
    function atalho(e) {
      if (e.key.toLowerCase() !== "k" || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      buscaRef.current?.focus();
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { iaLiberada } = usePlano();

  // Falha nunca vira zero. Saldo e resumo são o coração da tela: sem eles, a
  // tela troca os números por um aviso. Os outros painéis falham sozinhos.
  const [falhas, setFalhas] = useState({});

  const loadData = useCallback(async () => {
      const streakMonths = monthsForWindow(RITMO_MAX_WEEKS * 7);
      // allSettled: falha de um painel (ex.: IA) não derruba os demais
      const [wRes, tRes, sRes, iRes, gRes, ...streakRes] =
        await Promise.allSettled([
          walletsApi.list(),
          transactionsApi.list({ limit: 5 }),
          dashboardApi.summary(),
          // Sem IA no plano o backend recusa (AI_REQUIRES_PREMIUM): pedir só
          // gerava um 403 por visita. O card da Leitura mostra o cadeado.
          iaLiberada ? aiApi.getInsight() : Promise.resolve({ data: null }),
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
      const falhou = (r) => r.status === "rejected";
      setFalhas({
        core: falhou(wRes) || falhou(sRes),
        tx: falhou(tRes),
        goals: falhou(gRes),
        // Um mês faltando pintaria dias com gasto como dias sem lançamento.
        ritmo: streakRes.some(falhou),
      });
      setLoading(false);
  }, [iaLiberada]);

  useEffect(() => {
    // Falso positivo: loadData só chama setState depois do await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  function tentarDeNovo() {
    setLoading(true);
    loadData();
  }

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
  // Quanto da receita sobrou, já no inteiro que vai para a tela. Sem receita
  // não existe proporção: fica undefined e o tile diz isso, em vez de mostrar
  // Infinity%. Arredondar antes do sinal evita o "−0%" de um déficit mínimo.
  const taxaPoupanca = monthIncome > 0 ? Math.round((monthNet / monthIncome) * 100) : undefined;

  // Variação do saldo total vs. fim do mês anterior (derivável do resultado do
  // mês corrente). Só faz sentido na visão "todas as carteiras".
  const prevBalance = totalBalance - monthNet;

  // Variação de cada KPI contra o mês anterior, lida do próprio fluxo de caixa
  // (que já vem por mês do backend). Sem o mês anterior, o tile não mostra %.
  const hoje = new Date();
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const prevKey = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, "0")}`;
  const prevMonth = s.cash_flow.find((p) => p.month === prevKey);
  const prevIncome = prevMonth ? parseFloat(prevMonth.income) : 0;
  const prevExpenses = prevMonth ? parseFloat(prevMonth.expenses) : 0;
  const incomeChange = pctChange(monthIncome, prevIncome);
  const expenseChange = pctChange(monthExpenses, prevExpenses);
  const netChange = pctChange(monthNet, prevIncome - prevExpenses);
  const balanceChange =
    selectedWallet === "all" ? pctChange(totalBalance, prevBalance) : undefined;

  const cashFlowData = s.cash_flow.map((p) => ({
    key: p.month,
    month: monthLabel(p.month),
    Entradas: parseFloat(p.income),
    Saídas: parseFloat(p.expenses),
  }));

  // O backend manda o top-5; o que sobra vira "Demais categorias" para a
  // pizza fechar com o tile de Despesas. Antes ela somava só o top-5 e dizia
  // um total menor que o do tile ao lado.
  const topCategorias = s.top_categories.map((c) => ({
    name: c.category,
    value: parseFloat(c.total),
  }));
  const resto = monthExpenses - topCategorias.reduce((sum, c) => sum + c.value, 0);
  const categoryData =
    resto >= 0.01
      ? [...topCategorias, { name: "Demais categorias", value: resto, resto: true }]
      : topCategorias;
  const categoryTotal = monthExpenses;

  // Rodapé da pizza: três números do mês, do que já foi buscado (os
  // lançamentos do Ritmo cobrem o mês corrente inteiro).
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const maiorGasto = streakTx
    .filter((t) => t.type === "EXPENSE" && String(t.date).startsWith(mesAtual))
    .reduce((maior, t) => (!maior || parseFloat(t.amount) > parseFloat(maior.amount) ? t : maior), null);
  const destaquesPizza = {
    mediaDiaria: monthExpenses / hoje.getDate(),
    diasDecorridos: hoje.getDate(),
    maiorGasto,
    variacao: expenseChange,
  };

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

  // Esqueleto no formato do painel: nada pula quando os dados chegam. A
  // estrela pulsando fica para o boot do app inteiro (App.jsx).
  if (loading) {
    return (
      <div className="space-y-4">
        <p role="status" className="sr-only">Carregando o painel</p>
        <div aria-hidden="true" className="motion-safe:animate-pulse">
          <div className="h-3 w-32 rounded-full bg-line/[0.07]" />
          <div className="mt-3 h-8 w-64 rounded-full bg-line/[0.07]" />
          <div className="mt-3 h-3 w-72 rounded-full bg-line/[0.07]" />
        </div>
        <div aria-hidden="true" className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {[
            "xl:col-span-4 min-h-[320px]",
            "xl:col-span-5 min-h-[320px]",
            "xl:col-span-3 min-h-[320px]",
            "xl:col-span-7 min-h-[380px]",
            "xl:col-span-5 min-h-[380px]",
          ].map((forma) => (
            <div key={forma} className={`panel motion-safe:animate-pulse ${forma}`} />
          ))}
        </div>
      </div>
    );
  }

  if (falhas.core) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-content tracking-tight">{saudacao()}, {firstName}</h1>
        <LoadError what="seu saldo e o resumo do mês" onRetry={tentarDeNovo} />
      </div>
    );
  }

  const walletOptions = [
    { value: "all", label: "Todas as carteiras" },
    ...wallets.map((w) => ({ value: w.id, label: w.name })),
  ];

  // A busca do topo procura lançamentos, a mesma busca do Extrato: Enter leva
  // para lá com o termo na URL. Abaixo de 2 caracteres fica aqui, porque o
  // Extrato não busca termo tão curto e mostraria a lista inteira.
  function buscar(e) {
    e.preventDefault();
    const termo = busca.trim();
    if (termo.length < 2) return;
    navigate(`/transactions?q=${encodeURIComponent(termo)}`);
  }

  // Atalho: abre o form do Extrato já com o tipo pré-selecionado
  const newTransaction = (type) =>
    navigate("/transactions", { state: { newType: type } });

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho: saudação, busca de lançamentos e ações ─────────────
          Ferramentas no vão, não números: tudo o que é dado já está nos KPIs.
          No celular a busca desce para uma linha própria. */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-xs text-content-3 first-letter:uppercase">{todayLabel}</p>
          <h1 className="text-3xl font-bold text-content tracking-tight mt-1">
            {saudacao()}, {firstName}
          </h1>
          <p className="text-sm text-content-2 mt-1">
            Seu saldo, seus gastos e seu ritmo neste mês.
          </p>
        </div>
        <form
          role="search"
          onSubmit={buscar}
          className="relative order-last w-full md:order-none md:w-auto md:max-w-md md:flex-1"
        >
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-3"
          />
          <Input
            ref={buscaRef}
            type="search"
            aria-label="Buscar lançamentos"
            placeholder="Buscar lançamentos"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            maxLength={100}
            aria-keyshortcuts="Control+K Meta+K"
            className="h-10 rounded-full border-line/10 bg-surface pl-10 pr-16 text-content placeholder:text-content-3"
          />
          {/* Some quando há texto: ali fica o "x" nativo do campo de busca. */}
          {!busca && (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line/15 px-1.5 py-0.5 font-sans text-[11px] leading-none text-content-3 md:block"
            >
              {TECLA_BUSCA}
            </kbd>
          )}
        </form>
        <div className="flex items-center gap-2">
          <ThemeButton />
          {/* Só para quem tem a IA. No free o convite mora no card da Leitura,
              onde o recurso fica: três convites na mesma tela era insistência. */}
          {iaLiberada && (
            <Button onClick={() => navigate("/ai")} size="lg">
              Falar com a Norby <NorthStar size={14} />
            </Button>
          )}
        </div>
      </header>

      {/* ── Linha 1: saldo (4) + KPIs do mês (5) + meta (3) ───────────── */}
      {/* As linhas só dividem em colunas a partir de xl (1280). Entre 1024 e
          1279 a área útil tem ~650px: o 4/5/3 quebrava o saldo em duas linhas
          e cortava o nome das carteiras. Abaixo de xl cada card ocupa a
          largura toda, como no tablet. */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <section
          aria-labelledby="saldo-titulo"
          className="xl:col-span-4 panel p-6 flex flex-col gap-5 motion-rise"
          style={{ "--i": 0 }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="saldo-titulo" className="text-sm font-medium text-content-2">Saldo total</h2>
            {wallets.length > 1 && (
              <div className="w-44 shrink-0">
                <Select
                  id="wallet-filter"
                  value={selectedWallet}
                  options={walletOptions}
                  onChange={(v) => setSelectedWallet(v || "all")}
                />
              </div>
            )}
          </div>

          {/* O Score é do premium e mora junto do saldo: os dois respondem
              "como estou?". No free ele não aparece em lugar nenhum; o convite
              ao Premium já tem o botão do cabeçalho. */}
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            {/* Sem o "BRL" ao lado: o R$ já diz a moeda. */}
            <Money
              value={shownBalance}
              className="block tracking-tight text-4xl font-semibold text-content"
              centsClassName="text-2xl font-semibold text-content-2"
            />
            {balanceChange !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <span className={balanceChange >= 0 ? "chip-pos" : "chip-neg"}>
                  {balanceChange >= 0 ? (
                    <ArrowUpRight size={12} />
                  ) : (
                    <ArrowDownRight size={12} />
                  )}
                  {formatPct(balanceChange)}
                </span>
                <span className="text-xs text-content-3">vs. mês passado</span>
              </div>
            )}
          </div>
          {/* ml-auto: quando não cabe ao lado do saldo (card de ~340px em
              1440), desce para a linha de baixo mas fica à direita. */}
          {iaLiberada && insight?.score != null && (
            <div className="ml-auto text-right">
              <p className="text-xs text-content-3">Score financeiro</p>
              <p className="mt-1 tnum tracking-tight">
                <span className="text-2xl font-semibold text-content">{Math.round(insight.score)}</span>
                <span className="text-sm font-medium text-content-3">/100</span>
              </p>
            </div>
          )}
          </div>

          {/* Tinta para a ação principal, cinza para a segunda: os dois
              atalhos continuam lado a lado, mas não disputam atenção. */}
          <div className="flex gap-2">
            <Button onClick={() => newTransaction("INCOME")} className="flex-1">
              <Plus size={15} /> Receita
            </Button>
            <Button
              onClick={() => newTransaction("EXPENSE")}
              variant="secondary"
              className="flex-1"
            >
              <Minus size={15} /> Despesa
            </Button>
          </div>

          {wallets.length > 0 && (
            <div className="mt-auto pt-4 border-t border-line/[0.08]">
              <p className="text-xs text-content-3 mb-2.5">
                Carteiras · {wallets.length}
              </p>
              <ul className="flex flex-col gap-2">
                {wallets.slice(0, 3).map((w) => (
                  <li key={w.id} className="flex items-center gap-2.5 min-w-0">
                    <WalletMark wallet={w} className="size-7 rounded-lg text-[11px]" />
                    <span className="flex-1 truncate text-sm text-content-2">{w.name}</span>
                    <span className="text-sm font-medium text-content tnum">
                      {formatBRL(w.balance)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* KPIs do mês: um tile só leva o acento, é o ponto focal da tela */}
        <section className="xl:col-span-5 panel p-4 grid grid-cols-2 gap-3 content-start">
          <h2 className="sr-only">Resumo do mês</h2>
          {/* A Sobra é o foco: responde "como estou este mês?" de relance. */}
          <StatTile
            highlight
            label="Sobra do mês"
            className="motion-rise"
            style={{ "--i": 1 }}
            value={<Money value={monthNet} centsClassName={TILE_CENTS_ON_ACCENT} />}
            icon={PiggyBank}
            delta={netChange}
          />
          <StatTile
            label="Receitas"
            className="motion-rise"
            style={{ "--i": 2 }}
            value={<Money value={monthIncome} centsClassName={TILE_CENTS} />}
            icon={ArrowDownLeft}
            delta={incomeChange}
          />
          <StatTile
            label="Despesas"
            className="motion-rise"
            style={{ "--i": 3 }}
            value={<Money value={monthExpenses} centsClassName={TILE_CENTS} />}
            icon={ArrowUpRight}
            delta={expenseChange}
            upIsGood={false}
          />
          {/* Gratuito para todos: a Sobra dita em proporção da receita. */}
          <StatTile
            label="Taxa de poupança"
            className="motion-rise"
            style={{ "--i": 4 }}
            value={
              taxaPoupanca === undefined
                ? "—"
                : `${taxaPoupanca < 0 ? MENOS : ""}${formatPct(taxaPoupanca, 0)}`
            }
            icon={Percent}
            note={taxaPoupanca === undefined ? "sem receita no mês" : "da receita do mês"}
          />
        </section>

        {/* Meta em destaque */}
        <div className="xl:col-span-3 panel p-6 flex flex-col motion-rise" style={{ "--i": 5 }}>
          {falhas.goals ? (
            <p className="m-auto py-6 text-xs text-content-3 text-center">Não conseguimos carregar suas metas agora.</p>
          ) : featuredGoal ? (
            <>
              <div className="relative flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-income/15 flex items-center justify-center shrink-0 text-income">
                  <Target size={17} aria-hidden="true" />
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
                <div className="w-9 h-9 rounded-xl bg-income/15 flex items-center justify-center shrink-0 text-income">
                  <Target size={17} aria-hidden="true" />
                </div>
                <h2 className="font-semibold text-content">Metas</h2>
              </div>
              <p className="relative text-xs text-content-2 leading-relaxed mt-4 flex-1">
                Crie uma meta de reserva para acompanhar o progresso dela aqui
                no painel.
              </p>
              <Button
                onClick={() => navigate("/goals")}
                variant="outline"
                className="w-full font-semibold"
              >
                Criar uma meta <ArrowRight size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Linha 2: ritmo (7, largo para caber semanas) + categorias (5) ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <RitmoCard transactions={streakTx} erro={falhas.ritmo} />
        <CategoryPie data={categoryData} total={categoryTotal} destaques={destaquesPizza} />
      </div>

      {/* ── Linha 3: fluxo de caixa + leitura da IA ─────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 panel p-6">
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
              {/* Fica na ordem do Tab: é o único lugar com os valores de cada
                  mês, e as setas percorrem os meses. O title dá o nome. */}
              <AreaChart
                title="Fluxo de caixa: entradas e saídas por mês"
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
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={axisTick}
                  tickFormatter={reaisCompacto}
                  width={64}
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

        <InsightCard insight={insight} bloqueada={!iaLiberada} />
      </div>

      {/* ── Linha 4: movimentações recentes ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Movimentações recentes */}
        <div className="xl:col-span-12 panel p-6 flex flex-col">
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
            {falhas.tx ? (
              <p className="m-auto py-6 text-xs text-content-3 text-center">
                Não conseguimos carregar as movimentações agora.
              </p>
            ) : transactions.length === 0 ? (
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
                      <div className="w-9 h-9 rounded-[10px] bg-surface-inset flex items-center justify-center shrink-0 text-content-2">
                        <CategoryIcon category={t.category} type={t.type} />
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
                      {formatSinal(t.amount, isIncome)}
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
