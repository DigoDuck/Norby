import { useEffect, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Trash2, Pencil } from "lucide-react";

import { transactionsApi } from "@/api/transactions";
import { walletsApi } from "@/api/wallets";
import { recurringApi } from "@/api/recurring";
import { CATEGORIES } from "@/lib/categories";
import { transactionSchema } from "@/lib/schemas";
import { formatDateBR, formatBRL, inputCls, toDateInput, todayInput } from "@/lib/utils";

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
  { value: "EXPENSE", label: "Despesa", activeClass: "bg-norby-danger text-norby-ivory" },
  { value: "INCOME", label: "Receita", activeClass: "bg-norby-income text-norby-night" },
];

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }));


export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      wallet_id: "",
      type: "EXPENSE",
      amount: "",
      category: CATEGORIES[0],
      description: "",
      date: todayInput(),
    },
  });

  // Watch type for Segmented (not strictly needed in render, but kept for consistency)
  useWatch({ control, name: "type" });

  async function load(params = {}) {
    await recurringApi.run().catch(() => {});
    const res = await transactionsApi.list(params);
    setTransactions(res.data);
  }

  useEffect(() => {
    walletsApi.list().then((r) => {
      setWallets(r.data);
    });
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => load(filterType ? { type: filterType } : {}),
      400,
    );
    return () => clearTimeout(timer);
  }, [filterType]);

  // Auto-select the sole wallet only when NOT editing
  useEffect(() => {
    if (wallets.length === 1 && !editing) {
      reset((prev) => ({ ...prev, wallet_id: wallets[0].id }));
    }
  }, [wallets]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => load(filterType ? { type: filterType } : {});

  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }));

  function openNew() {
    setEditing(null);
    setServerError(null);
    reset({
      wallet_id: wallets.length === 1 ? wallets[0].id : "",
      type: "EXPENSE",
      amount: "",
      category: CATEGORIES[0],
      description: "",
      date: todayInput(),
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
      setServerError(
        err.response?.data?.detail || "Não foi possível salvar a transação.",
      );
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remover esta transação?")) return;
    try {
      await transactionsApi.delete(id);
      reload();
    } catch (err) {
      alert(
        err.response?.data?.detail || "Não foi possível remover a transação.",
      );
    }
  }

  const filtered = transactions.filter(
    (t) =>
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-norby-ivory tracking-tight">
            Relatórios
          </h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            Histórico completo de transações
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button
                onClick={openNew}
                className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
              />
            }
          >
            <Plus size={16} className="mr-1" /> Nova Transação
          </DialogTrigger>
          <DialogContent className="bg-norby-surface border-white/10 text-norby-ivory">
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
                      onChange={field.onChange}
                      options={TYPE_OPTIONS}
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
                      options={CATEGORY_OPTIONS}
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
                <p className="text-norby-danger text-xs">{serverError}</p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
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

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-2.5 text-norby-ivory/30" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-norby-ivory placeholder:text-norby-ivory/30"
          />
        </div>
        {["", "INCOME", "EXPENSE"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilterType(t)}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              filterType === t
                ? "bg-norby-teal text-norby-night font-medium"
                : "glass-card text-norby-ivory/50 hover:text-norby-ivory"
            }`}
          >
            {t === "" ? "Todos" : t === "INCOME" ? "Receitas" : "Despesas"}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {["Categoria", "Descrição", "Tipo", "Valor", "Data", ""].map((h) => (
                <th
                  key={h}
                  className="text-left text-xs font-medium text-norby-ivory/50 uppercase tracking-wider px-4 py-3"
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
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-norby-ivory/90">
                  {t.category}
                </td>
                <td className="px-4 py-3 text-sm text-norby-ivory/60">
                  {t.description || "-"}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    className={
                      t.type === "INCOME"
                        ? "bg-norby-income/15 text-norby-income border-norby-income/20 rounded-lg"
                        : "bg-norby-danger/15 text-norby-danger border-norby-danger/20 rounded-lg"
                    }
                  >
                    {t.type === "INCOME" ? "Receita" : "Despesa"}
                  </Badge>
                </td>
                <td
                  className={`px-4 py-3 text-sm font-semibold tnum ${
                    t.type === "INCOME" ? "text-norby-income" : "text-norby-danger"
                  }`}
                >
                  {t.type === "INCOME" ? "+" : "-"}
                  {formatBRL(t.amount)}
                </td>
                <td className="px-4 py-3 text-sm text-norby-ivory/60">
                  {formatDateBR(t.date)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      className="text-norby-ivory/50 hover:text-norby-ivory transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="text-norby-ivory/50 hover:text-norby-danger transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-norby-ivory/40 text-sm">
            Nenhuma transação encontrada.
          </div>
        )}
      </div>
    </div>
  );
}
