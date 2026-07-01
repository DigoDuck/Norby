import { useEffect, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Target, PiggyBank } from "lucide-react";

import { goalsApi } from "@/api/goals";
import { CATEGORIES } from "@/lib/categories";
import { goalSchema } from "@/lib/schemas";
import { formatBRL, inputCls } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const TYPE_OPTIONS = [
  { value: "SAVINGS", label: "Poupança" },
  { value: "BUDGET", label: "Orçamento" },
];

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c }));

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      name: "",
      type: "SAVINGS",
      target_amount: "",
      current_amount: "",
      category: "",
    },
  });

  // Watch type to toggle conditional fields and label
  const type = useWatch({ control, name: "type" });

  async function load() {
    setGoals((await goalsApi.list()).data);
  }

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setServerError(null);
      reset({
        name: "",
        type: "SAVINGS",
        target_amount: "",
        current_amount: "",
        category: "",
      });
    }
  }

  async function onSubmit(data) {
    setServerError(null);
    const payload = {
      name: data.name,
      type: data.type,
      target_amount: data.target_amount,
      ...(data.type === "SAVINGS"
        ? { current_amount: data.current_amount || 0 }
        : { category: data.category }),
    };
    try {
      await goalsApi.create(payload);
      setOpen(false);
      load();
    } catch (err) {
      setServerError(err.response?.data?.detail || "Não foi possível salvar a meta.");
    }
  }

  async function handleContribute(goal) {
    const raw = prompt(`Adicionar aporte em "${goal.name}" (use negativo para corrigir):`);
    if (raw === null) return;
    const amount = Number(raw);
    if (!amount) return;
    try {
      await goalsApi.contribute(goal.id, amount);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Não foi possível salvar o aporte.");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remover esta meta?")) return;
    try {
      await goalsApi.delete(id);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Não foi possível remover a meta.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-norby-ivory tracking-tight">Metas</h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            Objetivos de poupança e orçamentos mensais
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium" />
            }
          >
            <Plus size={16} className="mr-1" /> Nova Meta
          </DialogTrigger>
          <DialogContent className="bg-norby-surface border-white/10 text-norby-ivory">
            <DialogHeader>
              <DialogTitle>Nova meta</DialogTitle>
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

              {/* Nome */}
              <Field label="Nome" htmlFor="name" error={errors.name?.message}>
                <Input
                  id="name"
                  placeholder="Ex: Fundo de emergência"
                  className={inputCls}
                  {...register("name")}
                />
              </Field>

              {/* Valor-alvo / Teto mensal */}
              <Field
                label={type === "BUDGET" ? "Teto mensal" : "Valor-alvo"}
                htmlFor="target_amount"
                error={errors.target_amount?.message}
              >
                <Input
                  id="target_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  className={`${inputCls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  {...register("target_amount")}
                />
              </Field>

              {/* Condicional: SAVINGS → já guardado; BUDGET → categoria */}
              {type === "SAVINGS" ? (
                <Field
                  label="Já guardado (opcional)"
                  htmlFor="current_amount"
                  error={errors.current_amount?.message}
                >
                  <Input
                    id="current_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    className={`${inputCls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                    {...register("current_amount")}
                  />
                </Field>
              ) : (
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
              )}

              {serverError && (
                <p className="text-norby-danger text-xs">{serverError}</p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
              >
                {isSubmitting ? "Salvando…" : "Criar meta"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {goals.length === 0 && (
          <p className="col-span-2 text-norby-ivory/40 text-sm">Nenhuma meta ainda.</p>
        )}
        {goals.map((g) => {
          const pct = Math.min(g.progress_pct, 100);
          const over = g.type === "BUDGET" && g.progress_pct >= 100;
          const near = g.type === "BUDGET" && g.progress_pct >= 80 && !over;
          const barColor = over
            ? "bg-norby-danger"
            : near
              ? "bg-[#E0B341]"
              : "bg-norby-teal";
          const Icon = g.type === "SAVINGS" ? PiggyBank : Target;
          return (
            <div key={g.id} className="glass-card-hover p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-norby-teal/15 flex items-center justify-center">
                    <Icon size={18} className="text-norby-teal" />
                  </div>
                  <div>
                    <p className="text-norby-ivory font-medium">{g.name}</p>
                    <p className="text-xs text-norby-ivory/40">
                      {g.type === "SAVINGS" ? "Poupança" : `Orçamento · ${g.category}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {g.type === "SAVINGS" && (
                    <button
                      type="button"
                      onClick={() => handleContribute(g)}
                      className="p-2 rounded-lg text-norby-ivory/40 hover:text-norby-teal hover:bg-white/5"
                      title="Adicionar aporte"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(g.id)}
                    className="p-2 rounded-lg text-norby-ivory/40 hover:text-norby-danger hover:bg-white/5"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-norby-ivory/60 tnum">
                  {formatBRL(g.current_amount)} / {formatBRL(g.target_amount)}
                </span>
                <span className={over ? "text-norby-danger" : "text-norby-ivory/40"}>
                  {g.progress_pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
