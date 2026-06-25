import { useEffect, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Repeat, Pause, Play } from "lucide-react";

import { recurringApi } from "@/api/recurring";
import { walletsApi } from "@/api/wallets";
import { CATEGORIES } from "@/lib/categories";
import { recurringSchema } from "@/lib/schemas";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const WEEKDAYS_OPTIONS = [
  { value: "0", label: "Segunda" },
  { value: "1", label: "Terça" },
  { value: "2", label: "Quarta" },
  { value: "3", label: "Quinta" },
  { value: "4", label: "Sexta" },
  { value: "5", label: "Sábado" },
  { value: "6", label: "Domingo" },
];

const WEEKDAYS_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const FREQUENCY_OPTIONS = [
  { value: "MONTHLY", label: "Mensal" },
  { value: "WEEKLY", label: "Semanal" },
];

const TYPE_OPTIONS = [
  { value: "EXPENSE", label: "Despesa", activeClass: "bg-norby-danger text-norby-ivory" },
  { value: "INCOME", label: "Receita", activeClass: "bg-norby-income text-norby-night" },
];

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }));

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-norby-ivory text-sm placeholder:text-norby-ivory/40 focus:outline-none focus:ring-2 focus:ring-norby-teal/40 transition";

export default function Recurring() {
  const [items, setItems] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(recurringSchema),
    defaultValues: {
      wallet_id: "",
      type: "EXPENSE",
      amount: "",
      category: CATEGORIES[0],
      frequency: "MONTHLY",
      day_of_month: 1,
      weekday: undefined,
    },
  });

  async function load() {
    const [r, w] = await Promise.all([recurringApi.list(), walletsApi.list()]);
    setItems(r.data);
    setWallets(w.data);
  }

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  // Build wallet options
  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }));

  // Auto-select the sole wallet when wallets load
  useEffect(() => {
    if (wallets.length === 1) {
      reset((prev) => ({ ...prev, wallet_id: wallets[0].id }));
    }
  }, [wallets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch frequency to conditionally show day_of_month or weekday field
  const frequency = useWatch({ control, name: "frequency" });

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setServerError(null);
      reset({
        wallet_id: wallets.length === 1 ? wallets[0].id : "",
        type: "EXPENSE",
        amount: "",
        category: CATEGORIES[0],
        frequency: "MONTHLY",
        day_of_month: 1,
        weekday: undefined,
      });
    }
  }

  async function onSubmit(data) {
    setServerError(null);
    const payload = {
      wallet_id: data.wallet_id,
      type: data.type,
      amount: data.amount,
      category: data.category,
      frequency: data.frequency,
      ...(data.frequency === "MONTHLY"
        ? { day_of_month: Number(data.day_of_month) }
        : { weekday: Number(data.weekday) }),
    };
    try {
      await recurringApi.create(payload);
      setOpen(false);
      load();
    } catch (err) {
      setServerError(
        err.response?.data?.detail || "Não foi possível salvar a recorrência."
      );
    }
  }

  async function toggleActive(item) {
    await recurringApi.update(item.id, { active: !item.active });
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Remover esta recorrência?")) return;
    await recurringApi.delete(id);
    load();
  }

  const fmt = (v) =>
    `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const cadence = (it) =>
    it.frequency === "MONTHLY"
      ? `Mensal · dia ${it.day_of_month}`
      : `Semanal · ${WEEKDAYS_LABELS[it.weekday]}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-norby-ivory tracking-tight">
            Recorrências
          </h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            Contas e receitas que se repetem automaticamente
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium" />
            }
          >
            <Plus size={16} className="mr-1" /> Nova Recorrência
          </DialogTrigger>
          <DialogContent className="bg-norby-surface border-white/10 text-norby-ivory">
            <DialogHeader>
              <DialogTitle>Nova recorrência</DialogTitle>
            </DialogHeader>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-3 mt-2"
            >
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
                  className={inputCls}
                  {...register("amount")}
                />
              </Field>

              {/* Frequência */}
              <Field
                label="Frequência"
                htmlFor="frequency"
                error={errors.frequency?.message}
              >
                <Controller
                  name="frequency"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="frequency"
                      value={field.value}
                      onChange={field.onChange}
                      options={FREQUENCY_OPTIONS}
                    />
                  )}
                />
              </Field>

              {/* Condicional: dia do mês ou dia da semana */}
              {frequency === "MONTHLY" ? (
                <Field
                  label="Dia do mês (1-28)"
                  htmlFor="day_of_month"
                  error={errors.day_of_month?.message}
                >
                  <Input
                    id="day_of_month"
                    type="number"
                    min="1"
                    max="28"
                    placeholder="1"
                    className={inputCls}
                    {...register("day_of_month")}
                  />
                </Field>
              ) : (
                <Field
                  label="Dia da semana"
                  htmlFor="weekday"
                  error={errors.weekday?.message}
                >
                  <Controller
                    name="weekday"
                    control={control}
                    render={({ field }) => (
                      <Select
                        id="weekday"
                        value={field.value != null ? String(field.value) : ""}
                        onChange={(v) => field.onChange(v)}
                        placeholder="Selecionar dia"
                        options={WEEKDAYS_OPTIONS}
                      />
                    )}
                  />
                </Field>
              )}

              {serverError && (
                <p className="text-norby-danger text-xs">{serverError}</p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
              >
                {isSubmitting ? "Salvando…" : "Criar recorrência"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {items.length === 0 && (
          <p className="text-norby-ivory/40 text-sm">Nenhuma recorrência ainda.</p>
        )}
        {items.map((it) => (
          <div key={it.id} className="glass-card-hover p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-norby-teal/15 flex items-center justify-center">
              <Repeat size={18} className="text-norby-teal" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-norby-ivory font-medium truncate">
                {it.category}{" "}
                <span
                  className={
                    it.type === "INCOME"
                      ? "text-norby-income"
                      : "text-norby-ivory/50"
                  }
                >
                  · {it.type === "INCOME" ? "+" : "−"} {fmt(it.amount)}
                </span>
              </p>
              <p className="text-xs text-norby-ivory/40">
                {cadence(it)} · próx.{" "}
                {new Date(it.next_run_date).toLocaleDateString("pt-BR")}
                {!it.active && " · pausada"}
              </p>
            </div>
            <button
              onClick={() => toggleActive(it)}
              className="p-2 rounded-lg text-norby-ivory/40 hover:text-norby-ivory hover:bg-white/5"
              title={it.active ? "Pausar" : "Retomar"}
            >
              {it.active ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => handleDelete(it.id)}
              className="p-2 rounded-lg text-norby-ivory/40 hover:text-norby-danger hover:bg-white/5"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
