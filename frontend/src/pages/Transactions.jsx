import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { LoadError } from "@/components/shared/LoadState";

import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { categoriesFor, reconcileCategory, TRANSACTION_TYPE_OPTIONS } from "@/lib/categories";
import CategoryIcon from "@/components/shared/CategoryIcon";
import WalletMark from "@/components/shared/WalletMark";
import { transactionSchema } from "@/lib/schemas";
import { apiErrorMessage, formatBRL, formatDateBR, inputCls, toDateInput, todayInput, formatSinal } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";



const PAGE_SIZE = 50;

// "" é "sem filtro de tipo", o mesmo valor que o backend entende.
const FILTRO_TIPO = [
  { value: "", label: "Todos" },
  { value: "INCOME", label: "Receitas" },
  { value: "EXPENSE", label: "Despesas" },
];

// "Todos os meses" + os últimos 24 meses, do atual para trás. O dia 1 no
// construtor deixa a Date virar o ano sozinha (janeiro - 1 = dezembro do ano
// anterior).
// ponytail: janela fixa de 24 meses; buscar a data do lançamento mais antigo
// se alguém precisar filtrar antes disso.
function opcoesDeMes(hoje = new Date()) {
  const meses = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const rotulo = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: rotulo[0].toUpperCase() + rotulo.slice(1),
    };
  });
  return [{ value: "todos", label: "Todos os meses" }, ...meses];
}

// Valores iniciais do formulário (date sempre fresca → função).
const emptyForm = () => ({
  wallet_id: "",
  type: "EXPENSE",
  amount: "",
  category: categoriesFor("EXPENSE")[0],
  description: "",
  date: todayInput(),
});


export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [serverError, setServerError] = useState(null);
  // ?q= é a porta de entrada da busca do Dashboard: o campo já nasce com o
  // termo, e a primeira carga já vem filtrada.
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  // Termo cuja RESPOSTA está na tela, que não é o mesmo que o digitado: entre
  // a tecla e o fim do debounce a lista ainda é a anterior. Anunciar a partir
  // do texto digitado faz o leitor de tela ouvir uma contagem que não é da
  // busca que a pessoa acabou de escrever — no segundo caractere ele leria a
  // contagem da lista sem filtro nenhum.
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filterType, setFilterType] = useState("");
  // "todos" ou "aaaa-mm". "" não serve: é o valor que o Select trata como vazio.
  const [mes, setMes] = useState("todos");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  // Totais do que está filtrado (/transactions/summary). null = sem totais
  // para mostrar (carregando ou falhou), nunca zero inventado.
  const [resumo, setResumo] = useState(null);
  // Começa carregando: sem isso o primeiro render já dizia "nenhuma transação".
  const [loading, setLoading] = useState(true);
  // false quando o header X-Total-Count não chegou (backend antigo, proxy,
  // CORS mal configurado): nesse caso `total` é só o length da página, não o
  // total real, e a UI não pode tratá-lo como se fosse.
  const [totalConhecido, setTotalConhecido] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: emptyForm(),
  });

  // Contador de sequência: o filtro dispara load() direto no clique, e sem isso
  // dois cliques rápidos podem ter a resposta ANTIGA chegando por último e
  // sobrescrevendo a lista, com o botão do filtro novo aparecendo selecionado.
  // O debounce anterior mascarava isso via clearTimeout; agora é explícito.
  // ponytail: contador em vez de AbortController — não precisamos abortar a
  // request, só ignorar a resposta obsoleta. Trocar se o custo da chamada pesar.
  const requisicaoAtual = useRef(0);

  async function load(params = {}, novoOffset = 0) {
    const seq = ++requisicaoAtual.current;
    setLoading(true);
    try {
      const [res, resumoRes] = await Promise.all([
        transactionsApi.list({
          ...params,
          limit: PAGE_SIZE,
          offset: novoOffset,
        }),
        // Mesmos filtros, sem paginação. Se o resumo falhar, os totais somem e
        // a lista segue: ela não depende deles.
        transactionsApi.summary(params).catch(() => null),
      ]);
      if (seq !== requisicaoAtual.current) return; // resposta obsoleta
      setTransactions(res.data);
      setResumo(resumoRes?.data ?? null);
      // O header só chega ao JS porque o backend o declara em expose_headers.
      const headerTotal = res.headers?.["x-total-count"];
      setTotal(headerTotal != null ? Number(headerTotal) : res.data.length);
      setTotalConhecido(headerTotal != null);
      setOffset(novoOffset);
      setBuscaAplicada(params.q ?? "");
      setServerError(null);
    } catch (err) {
      if (seq !== requisicaoAtual.current) return; // resposta obsoleta
      setResumo(null);
      setServerError(apiErrorMessage(err, "Não foi possível carregar as transações."));
    } finally {
      if (seq === requisicaoAtual.current) setLoading(false);
    }
  }

  // Espelha `filterType` e `mes` em refs: o efeito de busca abaixo depende só
  // de `search`, então o setTimeout já agendado por uma digitação precisa
  // enxergar os filtros MAIS RECENTES quando disparar, não os do instante em
  // que foi agendado. Sem isso, trocar o mês durante a espera da busca fazia a
  // busca atrasada voltar a lista para todos os meses. A escrita mora num
  // efeito à parte porque refs não podem ser lidas nem escritas durante o
  // render (react-hooks/refs).
  const filterTypeRef = useRef(filterType);
  const mesRef = useRef(mes);
  useEffect(() => {
    filterTypeRef.current = filterType;
    mesRef.current = mes;
  }, [filterType, mes]);

  // Parâmetros do filtro de tipo + busca ativa, para toda chamada de load()
  // que precisa preservá-los (paginação, reload após criar/editar/excluir,
  // debounce da busca, clique nos botões de tipo). `tipo` é parametrizável
  // porque o clique no botão de tipo passa o valor NOVO antes de setFilterType
  // refletir no state — os demais chamadores usam o filtro atual por padrão.
  // `trim()`: dois espaços não é uma busca válida.
  function filtroAtivo(tipo = filterType, mesEscolhido = mes) {
    return {
      ...(tipo ? { type: tipo } : {}),
      ...(mesEscolhido !== "todos"
        ? { year: Number(mesEscolhido.slice(0, 4)), month: Number(mesEscolhido.slice(5)) }
        : {}),
      ...(search.trim().length >= 2 ? { q: search.trim() } : {}),
    };
  }

  useEffect(() => {
    walletsApi.list().then((r) => {
      setWallets(r.data);
    });
    // Falso positivo: `load` só chama setState DEPOIS do await. Buscar no
    // mount é o padrão do React sem biblioteca de data fetching, e este
    // projeto não tem uma.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(filtroAtivo());
    // Só no mount: filtroAtivo lê a busca que veio da URL. Depois disso, quem
    // recarrega é o efeito da busca, com espera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca no servidor, com espera de 300ms. Antes disto a busca era no
  // CLIENTE, filtrando só a página já carregada (no máximo PAGE_SIZE itens
  // por vez) — quem tivesse a transação numa página seguinte buscava e não
  // achava nada, sem qualquer aviso de que havia mais dados fora da vista.
  // Abaixo de 2 caracteres não busca: volta pra lista normal (sem `q`).
  const primeiraRenderizacao = useRef(true);
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      // O mount já dispara load() acima; sem este corte o efeito repetiria a
      // MESMA primeira página de novo, 300ms depois, à toa.
      primeiraRenderizacao.current = false;
      return;
    }
    const id = setTimeout(() => {
      load(filtroAtivo(filterTypeRef.current, mesRef.current), 0);
    }, 300);
    return () => clearTimeout(id);
    // filtroAtivo de propósito fora: é recriada a cada render, e incluí-la
    // reagendaria a busca a cada render (não só quando `search` muda). Tipo e
    // mês mais recentes chegam pelas refs, lidas dentro do timeout, não do closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Auto-seleciona a única carteira, sem sobrescrever uma escolha já feita nem
  // atrapalhar a edição.
  useEffect(() => {
    if (wallets.length === 1 && !editing && !getValues("wallet_id")) {
      reset((prev) => ({ ...prev, wallet_id: wallets[0].id }));
    }
  }, [wallets, editing, reset, getValues]);

  // Atalho vindo do Dashboard ("+ Receita" / "− Despesa"): abre o form já com
  // o tipo pré-selecionado. O state da rota é limpo em seguida para o dialog
  // não reabrir em navegação de histórico.
  useEffect(() => {
    const preset = location.state?.newType;
    if (preset !== "INCOME" && preset !== "EXPENSE") return;
    // Aqui a regra está tecnicamente certa: são setStates síncronos e custam
    // uma renderização a mais. Fica assim porque a fonte do dado é EXTERNA (o
    // state da rota), que é justamente o que efeito existe para sincronizar, e
    // roda uma vez só, no mount, antes de o dialog abrir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing(null);
    setServerError(null);
    reset({ ...emptyForm(), type: preset, category: categoriesFor(preset)[0] });
    setOpen(true);
    navigate(location.pathname, { replace: true });
    // roda só no mount: o state chega junto com a navegação que monta a página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Delete desloca offsets (o item some e os seguintes sobem uma posição) —
  // voltar pra página 1 evita mostrar uma página com buracos. Mantido de
  // propósito, ver onSubmit para o caso de edição (que preserva a página).
  const reload = () => load(filtroAtivo(), 0);

  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }));
  const carteiraPorId = Object.fromEntries(wallets.map((w) => [w.id, w]));

  const watchedType = useWatch({ control, name: "type" });
  const categoryOptions = categoriesFor(watchedType).map((c) => ({
    value: c,
    label: c,
  }));

  function openNew() {
    setEditing(null);
    setServerError(null);
    reset({
      ...emptyForm(),
      wallet_id: wallets.length === 1 ? wallets[0].id : "",
    });
    setOpen(true);
  }

  function openEdit(t) {
    setEditing(t);
    setServerError(null);
    reset({
      wallet_id: t.wallet_id,
      type: t.type,
      amount: Number(t.amount),
      category: t.category,
      description: t.description || "",
      date: toDateInput(t.date),
    });
    setOpen(true);
  }

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setEditing(null);
      setServerError(null);
    }
  }

  async function onSubmit(data) {
    setServerError(null);
    const payload = {
      wallet_id: data.wallet_id,
      type: data.type,
      amount: data.amount,
      category: data.category,
      description: data.description || "",
      date: data.date,
    };
    const wasEditing = Boolean(editing);
    try {
      if (editing) {
        await transactionsApi.update(editing.id, payload);
      } else {
        await transactionsApi.create(payload);
      }
      setOpen(false);
      setEditing(null);
      // Editar não muda quantos itens existem: preserva a página atual em vez
      // de reload() (que sempre volta pra página 1).
      if (wasEditing) {
        load(filtroAtivo(), offset);
      } else {
        reload();
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, "Não foi possível salvar a transação."));
    }
  }

  async function deleteTransaction(id) {
    await transactionsApi.delete(id);
    reload();
  }

  // Sem total conhecido (header ausente), uma página cheia é o sinal
  // disponível de que pode haver mais além dela.
  const haMaisPaginas = totalConhecido
    ? total > transactions.length
    : transactions.length === PAGE_SIZE;
  // Idem para "Próxima": sem total, avança enquanto a página vier cheia.
  const podeAvancar = totalConhecido
    ? offset + PAGE_SIZE < total
    : transactions.length === PAGE_SIZE;

  // Mesma fonte que a legenda de paginação usa — nunca inventar um segundo
  // número que possa discordar dela.
  const totalDaBusca = totalConhecido ? total : transactions.length;
  // Texto do role="status": anuncia o INÍCIO (carregando) e o RESULTADO da
  // busca, não só o início — dizer que começou e nunca dizer o que achou é
  // pior que não dizer nada, porque cria uma expectativa e a abandona.
  const textoStatus = loading
    ? "Carregando…"
    : buscaAplicada
      ? transactions.length === 0
        ? "Nenhuma transação encontrada para essa busca."
        : `${totalDaBusca} ${totalDaBusca === 1 ? "transação encontrada" : "transações encontradas"}`
      // Espaço INQUEBRÁVEL, escrito como escape porque o caractere cru é
      // invisível: some numa edição distraída ou num formatador que apara
      // espaços, e o ESLint não pega perda de espaço irregular dentro de
      // string. Texto só de espaço branco colapsa no HTML, o parágrafo fica
      // com altura zero, e a tabela volta a pular a cada carga.
      : "\u00A0";

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-content tracking-tight">
            Extrato
          </h1>
          <p className="text-content-2 text-sm mt-1">
            Todas as suas entradas e saídas
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button
                onClick={openNew}
                className="font-medium"
              />
            }
          >
            <Plus size={16} className="mr-1" /> Nova transação
          </DialogTrigger>
          <DialogContent className="bg-surface border-line/10 text-content">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar transação" : "Nova transação"}
              </DialogTitle>
              <p className="text-xs text-content-2 mt-0.5">
                Uma entrada ou saída de uma das suas carteiras
              </p>
            </DialogHeader>

            {/* eslint-disable-next-line react-hooks/refs -- falso positivo
                contra o react-hook-form: `handleSubmit(onSubmit)` devolve um
                handler, e os refs internos só são lidos quando ele é chamado
                no submit, nunca durante a renderização. É o uso documentado
                da biblioteca. */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-2">
              {/* Tipo */}
              <Field label="Tipo" error={errors.type?.message}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Segmented
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        setValue("category", reconcileCategory(v, getValues("category")));
                      }}
                      options={TRANSACTION_TYPE_OPTIONS}
                      ariaLabel="Tipo"
                    />
                  )}
                />
              </Field>

              {/* Carteira */}
              <Field
                label="Carteira"
                htmlFor="wallet_id"
                error={errors.wallet_id?.message}
              >
                <Controller
                  name="wallet_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="wallet_id"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Selecionar carteira"
                      options={walletOptions}
                    />
                  )}
                />
              </Field>

              {/* Categoria */}
              <Field
                label="Categoria"
                htmlFor="category"
                error={errors.category?.message}
              >
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="category"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Selecionar categoria"
                      options={categoryOptions}
                    />
                  )}
                />
              </Field>

              {/* Valor */}
              <Field
                label="Valor (R$)"
                htmlFor="amount"
                error={errors.amount?.message}
              >
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <MoneyInput
                      id="amount"
                      value={field.value}
                      onChange={field.onChange}
                      className={inputCls}
                    />
                  )}
                />
              </Field>

              {/* Descrição */}
              <Field
                label="Descrição (opcional)"
                htmlFor="description"
                error={errors.description?.message}
              >
                <Input
                  id="description"
                  placeholder="Ex: mercado, cinema..."
                  className={inputCls}
                  {...register("description")}
                />
              </Field>

              {/* Data */}
              <Field
                label="Data"
                htmlFor="date"
                error={errors.date?.message}
              >
                <Input
                  id="date"
                  type="date"
                  className={inputCls}
                  {...register("date")}
                />
              </Field>

              {serverError && (
                <p className="text-danger text-xs">{serverError}</p>
              )}

              <div className="flex gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleOpenChange(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[1.4] font-medium"
                >
                  {isSubmitting
                    ? "Salvando…"
                    : editing
                      ? "Salvar alterações"
                      : "Registrar transação"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros e relatório em uma única superfície */}
      <div className="panel overflow-hidden p-4 sm:p-5">
        {serverError && !open && (
          <LoadError
            what="suas transações"
            onRetry={() => load(filtroAtivo(), offset)}
            className="mb-4 border-0 shadow-none"
          />
        )}
        {/* Barra de filtros solta no card, sem caixa própria: uma caixa aqui
            era um card dentro do card. Busca à esquerda; mês e tipo, que
            recortam a lista, juntos à direita. */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1 md:max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-content-3" />
            <Input
              aria-label="Buscar transações"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
              className="pl-9 bg-surface-inset border-line/10 text-content placeholder:text-content-3"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center md:ml-auto">
          <div className="sm:w-52">
            <Select
              id="filtro-mes"
              ariaLabel="Mês"
              value={mes}
              options={opcoesDeMes()}
              onChange={(v) => {
                const escolhido = v || "todos";
                setMes(escolhido);
                load(filtroAtivo(filterType, escolhido), 0);
              }}
            />
          </div>
          <Segmented
            ariaLabel="Tipo"
            value={filterType}
            onChange={(tipo) => {
              setFilterType(tipo);
              load(filtroAtivo(tipo), 0);
            }}
            options={FILTRO_TIPO}
            className="sm:w-72"
          />
          </div>
        </div>

        {resumo && (
          <section
            aria-label="Totais do período"
            className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-4 border-y border-line/[0.08] py-4"
          >
            <div>
              <p className="text-xs text-content-3">Entradas</p>
              <p className="mt-1 text-lg font-semibold tnum text-income">
                {formatSinal(resumo.income, true)}
              </p>
            </div>
            <div>
              <p className="text-xs text-content-3">Saídas</p>
              <p className="mt-1 text-lg font-semibold tnum text-content">
                {formatSinal(resumo.expenses, false)}
              </p>
            </div>
            <div>
              <p className="text-xs text-content-3">Resultado</p>
              <p className="mt-1 text-lg font-semibold tnum text-content">
                {formatBRL(parseFloat(resumo.income) - parseFloat(resumo.expenses))}
              </p>
              <p className="text-[11px] text-content-3 tnum">
                em {resumo.count} {resumo.count === 1 ? "lançamento" : "lançamentos"}
              </p>
            </div>
          </section>
        )}

        {/* Duas responsabilidades, dois elementos.

            A linha VISÍVEL só mostra o carregamento, e é sempre montada: sem
            isso a tabela pulava ~20px a cada carga. O texto dela é curto, então
            nunca precisa de reticências. `aria-hidden` porque quem anuncia é a
            região abaixo, e ouvir "Carregando…" duas vezes é ruído.

            O ANÚNCIO vive numa região só para leitor de tela, onde a frase pode
            ter o tamanho que precisar sem disputar espaço com a tabela. Juntar
            os dois num elemento só custava caro: a 320px de largura a frase de
            busca vazia era cortada com reticências. O nó existe desde o começo
            porque role="status" não anuncia de forma confiável um nó que acaba
            de ser montado. */}
        <p aria-hidden="true" className="pb-2 text-xs text-content-3">
          {loading ? "Carregando…" : "\u00A0"}
        </p>
        <p role="status" className="sr-only">
          {textoStatus}
        </p>

        <table className="hidden w-full md:table">
          <thead>
            <tr className="border-b border-line/10">
              {/* Valor por último e à direita, como num extrato de banco: os
                  centavos ficam alinhados e a coluna se lê de cima a baixo. */}
              {["Categoria", "Descrição", "Carteira", "Data", "Valor", ""].map((h) => (
                <th
                  key={h}
                  className={`microlabel px-4 py-3 ${h === "Valor" ? "text-right" : "text-left"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr
                key={t.id}
                className="border-b border-line/5 last:border-0 hover:bg-state/[0.03] transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-content">
                  {t.category}
                </td>
                <td className="px-4 py-3 text-sm text-content-2">
                  {t.description || "-"}
                </td>
                <td className="px-4 py-3 text-sm text-content-2">
                  {carteiraPorId[t.wallet_id] ? (
                    <span className="flex items-center gap-2">
                      <WalletMark
                        wallet={carteiraPorId[t.wallet_id]}
                        className="size-5 shrink-0 rounded-md text-[9px]"
                      />
                      <span className="truncate">{carteiraPorId[t.wallet_id].name}</span>
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-content-2 tnum">
                  {formatDateBR(t.date)}
                </td>
                {/* O sinal já diz entrada ou saída; o vermelho em toda linha de
                    despesa pintava a tabela inteira. Verde só para entrada,
                    como nas movimentações do dashboard. */}
                <td
                  className={`px-4 py-3 text-right text-sm font-semibold tnum ${
                    t.type === "INCOME" ? "text-income" : "text-content"
                  }`}
                >
                  {formatSinal(t.amount, t.type === "INCOME")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="grid place-items-center size-8 rounded-md text-content-3 hover:text-content hover:bg-state/[0.06] transition-colors"
                    >
                      <Pencil size={16} />
                      <span className="sr-only">Editar transação</span>
                    </button>
                    <ConfirmDialog
                      title="Excluir esta transação?"
                      description={`${t.description || t.category} · ${formatSinal(t.amount, t.type === "INCOME")} · ${formatDateBR(t.date)}`}
                      confirmLabel="Excluir"
                      errorFallback="Não foi possível excluir a transação."
                      onConfirm={() => deleteTransaction(t.id)}
                      trigger={
                        <button
                          type="button"
                          className="grid place-items-center size-8 rounded-md text-content-3 hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 size={16} />
                          <span className="sr-only">Excluir transação</span>
                        </button>
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-3 md:hidden">
          {transactions.map((t) => (
            <article key={t.id} className="inset-panel px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-content">
                  <CategoryIcon category={t.category} type={t.type} size={15} className="shrink-0 text-content-3" />
                  <span className="truncate">{t.category}</span>
                </p>
                <p
                  className={`shrink-0 text-sm font-semibold tnum ${
                    t.type === "INCOME" ? "text-income" : "text-content"
                  }`}
                >
                  {formatSinal(t.amount, t.type === "INCOME")}
                </p>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-content-2">
                  {t.description || "Sem descrição"} ·{" "}
                  {carteiraPorId[t.wallet_id] && `${carteiraPorId[t.wallet_id].name} · `}
                  <time className="tnum">{formatDateBR(t.date)}</time>
                </p>
                <div className="-my-1 flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="grid place-items-center size-8 rounded-md text-content-3 hover:text-content hover:bg-state/[0.06] transition-colors"
                  >
                    <Pencil size={15} />
                    <span className="sr-only">Editar transação</span>
                  </button>
                    <ConfirmDialog
                      title="Excluir esta transação?"
                        description={`${t.description || t.category} · ${formatSinal(t.amount, t.type === "INCOME")} · ${formatDateBR(t.date)}`}
                      confirmLabel="Excluir"
                      errorFallback="Não foi possível excluir a transação."
                      onConfirm={() => deleteTransaction(t.id)}
                      trigger={
                        <button
                          type="button"
                          className="grid place-items-center size-8 rounded-md text-content-3 hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 size={16} />
                          <span className="sr-only">Excluir transação</span>
                        </button>
                      }
                    />
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Primeira carga: linhas-esqueleto no lugar da tabela vazia. Nas
            cargas seguintes a lista anterior fica na tela até a nova chegar. */}
        {loading && transactions.length === 0 && !serverError && (
          <div aria-hidden="true" className="space-y-2 motion-safe:animate-pulse">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-11 rounded-xl bg-line/[0.05]" />
            ))}
          </div>
        )}

        {/* Texto genérico de propósito: a frase específica de busca ("...para
            essa busca.") já mora no role="status" logo acima — repeti-la aqui
            faria um leitor de tela ouvir a mesma sentença duas vezes. */}
        {transactions.length === 0 && !loading && !serverError && (
          <div className="text-center py-12 text-content-3 text-sm">
            Nenhuma transação encontrada.
          </div>
        )}

        {(haMaisPaginas || offset > 0) && (
          <div className="flex items-center justify-between gap-4 pt-2">
            <p className="text-sm text-content-2 tnum">
              {totalConhecido
                ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} de ${total}`
                : transactions.length === 0
                  ? "Nenhuma transação nesta página"
                  : `${offset + 1}–${offset + transactions.length}`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={offset === 0}
                onClick={() => load(filtroAtivo(), offset - PAGE_SIZE)}
              >
                Anterior
              </Button>
              <Button
                variant="ghost"
                disabled={!podeAvancar}
                onClick={() => load(filtroAtivo(), offset + PAGE_SIZE)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
