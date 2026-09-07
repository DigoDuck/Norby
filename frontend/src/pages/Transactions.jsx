import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Trash2, Pencil } from "lucide-react";

import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { categoriesFor, emojiForCategory, reconcileCategory, TRANSACTION_TYPE_OPTIONS } from "@/lib/categories";
import { transactionSchema } from "@/lib/schemas";
import { apiErrorMessage, formatDateBR, formatBRL, inputCls, toDateInput, todayInput } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";



const PAGE_SIZE = 50;

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
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
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
      const res = await transactionsApi.list({
        ...params,
        limit: PAGE_SIZE,
        offset: novoOffset,
      });
      if (seq !== requisicaoAtual.current) return; // resposta obsoleta
      setTransactions(res.data);
      // O header só chega ao JS porque o backend o declara em expose_headers.
      const headerTotal = res.headers?.["x-total-count"];
      setTotal(headerTotal != null ? Number(headerTotal) : res.data.length);
      setTotalConhecido(headerTotal != null);
      setOffset(novoOffset);
      setServerError(null);
    } catch (err) {
      if (seq !== requisicaoAtual.current) return; // resposta obsoleta
      setServerError(apiErrorMessage(err, "Não foi possível carregar as transações."));
    } finally {
      if (seq === requisicaoAtual.current) setLoading(false);
    }
  }

  // Espelha `filterType` numa ref: o efeito de busca abaixo depende só de
  // `search` (não de `filterType`), então o setTimeout já agendado por uma
  // digitação precisa enxergar o filtro de tipo MAIS RECENTE quando disparar,
  // não o que existia no instante em que foi agendado. A escrita mora num
  // efeito à parte porque refs não podem ser lidas nem escritas durante o
  // render (react-hooks/refs).
  const filterTypeRef = useRef(filterType);
  useEffect(() => {
    filterTypeRef.current = filterType;
  }, [filterType]);

  // Parâmetros do filtro de tipo + busca ativa, para toda chamada de load()
  // que precisa preservá-los (paginação, reload após criar/editar/excluir).
  function filtroAtivo() {
    return {
      ...(filterType ? { type: filterType } : {}),
      ...(search.length >= 2 ? { q: search } : {}),
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
    load();
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
      const tipo = filterTypeRef.current;
      const params = {
        ...(tipo ? { type: tipo } : {}),
        ...(search.length >= 2 ? { q: search } : {}),
      };
      load(params, 0);
    }, 300);
    return () => clearTimeout(id);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-content tracking-tight">
            Relatórios
          </h1>
          <p className="text-content-2 text-sm mt-1">
            Histórico completo de transações
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button
                onClick={openNew}
                className="bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
              />
            }
          >
            <Plus size={16} className="mr-1" /> Nova Transação
          </DialogTrigger>
          <DialogContent className="bg-surface border-line/10 text-content">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar Transação" : "Nova Transação"}
              </DialogTitle>
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

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
              >
                {isSubmitting
                  ? "Salvando..."
                  : editing
                    ? "Salvar alterações"
                    : "Registrar Transação"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros e relatório em uma única superfície */}
      <div className="glass overflow-hidden p-4 sm:p-5">
        {serverError && !open && (
          <p className="text-danger text-xs pb-3">{serverError}</p>
        )}
        <div className="inset-panel mb-4 flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-2.5 text-content-3" />
            <Input
              aria-label="Buscar transações"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-surface border-line/10 text-content placeholder:text-content-3"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            {["", "INCOME", "EXPENSE"].map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={filterType === t}
                onClick={() => {
                  setFilterType(t);
                  load(
                    {
                      ...(t ? { type: t } : {}),
                      ...(search.length >= 2 ? { q: search } : {}),
                    },
                    0,
                  );
                }}
                className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                  filterType === t
                    ? "bg-accent-fill text-accent-contrast font-medium"
                    : "bg-line/5 text-content-2 hover:text-content"
                }`}
              >
                {t === "" ? "Todos" : t === "INCOME" ? "Receitas" : "Despesas"}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <p className="pb-2 text-xs text-content-3">Carregando…</p>
        )}

        <table className="hidden w-full md:table">
          <thead>
            <tr className="border-b border-line/10">
              {["Categoria", "Descrição", "Tipo", "Valor", "Data", ""].map((h) => (
                <th
                  key={h}
                  className="microlabel px-4 py-3 text-left"
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
                <td className="px-4 py-3">
                  <Badge
                    className={
                      t.type === "INCOME"
                        ? "bg-income/[0.15] text-income border-income/20 rounded-lg"
                        : "bg-expense/[0.15] text-expense border-expense/20 rounded-lg"
                    }
                  >
                    {t.type === "INCOME" ? "Receita" : "Despesa"}
                  </Badge>
                </td>
                <td
                  className={`px-4 py-3 text-sm font-semibold tnum ${
                    t.type === "INCOME" ? "text-income" : "text-expense"
                  }`}
                >
                  {t.type === "INCOME" ? "+" : "-"}
                  {formatBRL(t.amount)}
                </td>
                <td className="px-4 py-3 text-sm text-content-2 tnum">
                  {formatDateBR(t.date)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="text-content-3 hover:text-content transition-colors"
                    >
                      <Pencil size={16} />
                      <span className="sr-only">Editar transação</span>
                    </button>
                    <ConfirmDialog
                      title="Remover esta transação?"
                      confirmLabel="Remover"
                      errorFallback="Não foi possível remover a transação."
                      onConfirm={() => deleteTransaction(t.id)}
                      trigger={
                        <button
                          type="button"
                          className="text-content-3 hover:text-danger transition-colors"
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
            <article key={t.id} className="inset-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-content">
                    <span aria-hidden="true">{emojiForCategory(t.category, t.type)}</span>
                    <span className="truncate">{t.category}</span>
                  </p>
                  <p className="mt-1 truncate text-xs text-content-2">
                    {t.description || "Sem descrição"}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-semibold tnum ${
                    t.type === "INCOME" ? "text-income" : "text-expense"
                  }`}
                >
                  {t.type === "INCOME" ? "+" : "-"}
                  {formatBRL(t.amount)}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line/[0.08] pt-3">
                <div className="flex items-center gap-2">
                  <span className={t.type === "INCOME" ? "chip-pos" : "chip-neg"}>
                    {t.type === "INCOME" ? "Receita" : "Despesa"}
                  </span>
                  <time className="text-xs text-content-3 tnum">
                    {formatDateBR(t.date)}
                  </time>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="text-content-3 hover:text-content transition-colors"
                  >
                    <Pencil size={16} />
                    <span className="sr-only">Editar transação</span>
                  </button>
                  <ConfirmDialog
                    title="Remover esta transação?"
                    confirmLabel="Remover"
                    errorFallback="Não foi possível remover a transação."
                    onConfirm={() => deleteTransaction(t.id)}
                    trigger={
                      <button
                        type="button"
                        className="text-content-3 hover:text-danger transition-colors"
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

        {transactions.length === 0 && (
          <div className="text-center py-12 text-content-3 text-sm">
            {search.length >= 2
              ? "Nenhuma transação encontrada para essa busca."
              : "Nenhuma transação encontrada."}
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
