import { useEffect, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Repeat, Pause, Play } from "lucide-react";

import { recurringApi } from "@/api/recurring";
import { walletsApi } from "@/api/wallets";
import { categoriesFor, reconcileCategory } from "@/lib/categories";
import { recurringSchema } from "@/lib/schemas";
import { apiErrorMessage, formatDateBR, formatBRL, inputCls } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

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

// Valores iniciais do formulário de recorrência.
const emptyForm = () => ({
  wallet_id: "",
  type: "EXPENSE",
  amount: "",
  category: categoriesFor("EXPENSE")[0],
  description: "",
  frequency: "MONTHLY",
  day_of_month: 1,
  weekday: undefined,
});

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
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(recurringSchema),
    defaultValues: emptyForm(),
  });

  async function load() {
    const [r, w] = await Promise.all([recurringApi.list(), walletsApi.list()]);
    setItems(r.data);
    setWallets(w.data);
  }

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }));

  // Auto-seleciona a única carteira, sem sobrescrever uma escolha já feita.
  useEffect(() => {
    if (wallets.length === 1 && !getValues("wallet_id")) {
      reset((prev) => ({ ...prev, wallet_id: wallets[0].id }));
    }
  }, [wallets, reset, getValues]);

  // Observa a frequência para alternar entre os campos day_of_month e weekday.
  const frequency = useWatch({ control, name: "frequency" });

  const watchedType = useWatch({ control, name: "type" });
  const categoryOptions = categoriesFor(watchedType).map((c) => ({
    value: c,
    label: c,
  }));

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setServerError(null);
      reset({
        ...emptyForm(),
        wallet_id: wallets.length === 1 ? wallets[0].id : "",
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
      description: data.description || undefined,
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
      setServerError(apiErrorMessage(err, "Não foi possível salvar a recorrência."));
    }
  }

  async function toggleActive(item) {
    await recurringApi.update(item.id, { active: !item.active });
    load();
  }

  async function deleteRecurring(id) {
    await recurringApi.delete(id);
    load();
  }

  const cadence = (it) =>
    it.frequency === "MONTHLY"
      ? `Mensal · dia ${it.day_of_month}`
      : `Semanal · ${WEEKDAYS_LABELS[it.weekday]}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-content tracking-tight">
            Recorrências
          </h1>
          <p className="text-content-2 text-sm mt-1">
            Contas e receitas que se repetem automaticamente
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button className="bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium" />
            }
          >
            <Plus size={16} className="mr-1" /> Nova Recorrência
          </DialogTrigger>
          <DialogContent className="bg-surface border-line/10 text-content">
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
                  className={inputCls}
                  {...register("amount")}
                />
              </Field>

              {/* Descrição: o backend sempre aceitou, mas o form não enviava,
                  então toda linha da lista saía como "Recorrência automática". */}
              <Field
                label="Descrição (opcional)"
                htmlFor="description"
                error={errors.description?.message}
              >
                <Input
                  id="description"
                  placeholder="Ex.: Aluguel, Netflix, Internet…"
                  className={inputCls}
                  {...register("description")}
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
                <p className="text-danger text-xs">{serverError}</p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
              >
                {isSubmitting ? "Salvando…" : "Criar recorrência"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="glass p-8 text-center text-content-3 text-sm">
            Nenhuma recorrência ainda.
          </div>
        )}
        {items.map((it) => (
          <article
            key={it.id}
            className="glass-hover flex flex-col gap-4 p-4 lg:flex-row lg:items-center"
          >
            <div className="flex min-w-0 items-center gap-3 lg:flex-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/[0.15]">
                <Repeat size={18} className="text-accent" />
              </div>
              <p className="truncate text-sm font-medium text-content">
                {it.description || "Recorrência automática"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:contents">
              <span className="chip-neutral shrink-0">{cadence(it)}</span>
              <span className="text-xs text-content-2 lg:max-w-32 lg:truncate">
                {it.category}
              </span>
              <span
                className={`shrink-0 text-sm font-semibold tnum ${
                  it.type === "INCOME" ? "text-income" : "text-expense"
                }`}
              >
                <span aria-hidden="true">{it.type === "INCOME" ? "↑" : "↓"}</span>{" "}
                {it.type === "INCOME" ? "+" : "−"} {formatBRL(it.amount)}
              </span>
              <span className="text-xs text-content-3 tnum lg:min-w-40">
                Próx. {formatDateBR(it.next_run_date)}
                {!it.active && " · pausada"}
              </span>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => toggleActive(it)}
                className="p-2 rounded-lg text-content-3 hover:text-content hover:bg-state/5"
                title={it.active ? "Pausar" : "Retomar"}
              >
                {it.active ? <Pause size={14} /> : <Play size={14} />}
                <span className="sr-only">
                  {it.active ? "Pausar recorrência" : "Retomar recorrência"}
                </span>
              </button>
              <ConfirmDialog
                title="Remover esta recorrência?"
                confirmLabel="Remover"
                errorFallback="Não foi possível remover a recorrência."
                onConfirm={() => deleteRecurring(it.id)}
                trigger={
                  <button
                    type="button"
                    className="p-2 rounded-lg text-content-3 hover:text-danger hover:bg-state/5"
                  >
                    <Trash2 size={14} />
                    <span className="sr-only">Excluir recorrência</span>
                  </button>
                }
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
