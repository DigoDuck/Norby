import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Trash2, Pencil } from "lucide-react";

import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { recurringApi } from "@/api/recurring";
import { categoriesFor, reconcileCategory } from "@/lib/categories";
import { transactionSchema } from "@/lib/schemas";
import { apiErrorMessage, formatDateBR, formatBRL, inputCls, toDateInput, todayInput } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const TYPE_OPTIONS = [
  {
    value: "EXPENSE",
    label: "Despesa",
    activeClass: "bg-expense/[0.15] text-expense ring-1 ring-inset ring-expense/30",
  },
  {
    value: "INCOME",
    label: "Receita",
    activeClass: "bg-income/[0.15] text-income ring-1 ring-inset ring-income/30",
  },
];

const CATEGORY_EMOJI = {
  Alimentação: "🍽️",
  Moradia: "🏠",
  Transporte: "🚗",
  Saúde: "🩺",
  Educação: "📚",
  Lazer: "🎬",
  Compras: "🛍️",
  "Contas & Serviços": "🧾",
  Salário: "💼",
  "Freelance/Extra": "✨",
  Investimentos: "📈",
  Reembolso: "↩️",
  Presente: "🎁",
  Outros: "🏷️",
};

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

  async function load(params = {}) {
    await recurringApi.run().catch(() => {});
    const res = await transactionsApi.list(params);
    setTransactions(res.data);
  }

  useEffect(() => {
    walletsApi.list().then((r) => {
      setWallets(r.data);
    });
    load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => load(filterType ? { type: filterType } : {}),
      400,
    );
    return () => clearTimeout(timer);
  }, [filterType]);

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
    setEditing(null);
    setServerError(null);
    reset({ ...emptyForm(), type: preset, category: categoriesFor(preset)[0] });
    setOpen(true);
    navigate(location.pathname, { replace: true });
    // roda só no mount: o state chega junto com a navegação que monta a página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => load(filterType ? { type: filterType } : {});

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
      amount: String(t.amount),
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
    try {
      if (editing) {
        await transactionsApi.update(editing.id, payload);
      } else {
        await transactionsApi.create(payload);
      }
      setOpen(false);
      setEditing(null);
      reload();
    } catch (err) {
      setServerError(apiErrorMessage(err, "Não foi possível salvar a transação."));
    }
  }

  async function deleteTransaction(id) {
    await transactionsApi.delete(id);
    reload();
  }

  const filtered = transactions.filter(
    (t) =>
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase()),
  );

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
                      options={TYPE_OPTIONS}
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
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  className={`${inputCls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  {...register("amount")}
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
                onClick={() => setFilterType(t)}
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
            {filtered.map((t) => (
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
          {filtered.map((t) => (
            <article key={t.id} className="inset-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-content">
                    <span aria-hidden="true">{CATEGORY_EMOJI[t.category] ?? "🏷️"}</span>
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

        {filtered.length === 0 && (
          <div className="text-center py-12 text-content-3 text-sm">
            Nenhuma transação encontrada.
          </div>
        )}
      </div>
    </div>
  );
}
