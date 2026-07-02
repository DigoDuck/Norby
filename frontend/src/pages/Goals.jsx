import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Target, PiggyBank, ArrowRight, Check } from "lucide-react";

import { goalsApi } from "@/api/goals";
import { aiApi } from "@/api/ai";
import { CATEGORIES } from "@/lib/categories";
import { goalSchema } from "@/lib/schemas";
import { formatBRL, inputCls } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { AmountPromptDialog } from "@/components/shared/AmountPromptDialog";
import Money from "@/components/shared/Money";
import AiOrb from "@/components/shared/AiOrb";

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

const EMPTY_FORM = {
  name: "",
  type: "SAVINGS",
  target_amount: "",
  current_amount: "",
  category: "",
};

// Prazo "até out 2026" a partir do deadline (datetime | null).
const deadlineLabel = (d) =>
  d
    ? `até ${new Date(d)
        .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
        .replace(".", "")
        .replace(" de ", " ")}`
    : null;

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [insight, setInsight] = useState(null);
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState(null);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(goalSchema),
    defaultValues: EMPTY_FORM,
  });

  // Observa o type para alternar campos condicionais e o rótulo.
  const type = useWatch({ control, name: "type" });

  async function load() {
    setGoals((await goalsApi.list()).data);
  }

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    aiApi.getInsight().then((r) => setInsight(r.data)).catch(() => {});
  }, []);

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setServerError(null);
      reset(EMPTY_FORM);
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

  // Os diálogos tratam validação e erro da API; aqui só a chamada + reload.
  async function contribute(goalId, amount) {
    await goalsApi.contribute(goalId, amount);
    await load();
  }

  async function deleteGoal(id) {
    await goalsApi.delete(id);
    await load();
  }

  // Estatística viva do header: total guardado em metas de poupança.
  const totalSaved = goals
    .filter((g) => g.type === "SAVINGS")
    .reduce((s, g) => s + parseFloat(g.current_amount), 0);

  return (
    <div className="space-y-6">
      {/* Header com estatística viva */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-norby-ivory tracking-tight">
            Suas metas
          </h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            {goals.length} {goals.length === 1 ? "meta ativa" : "metas ativas"}
            {totalSaved > 0 && (
              <>
                {" "}· você já guardou{" "}
                <span className="text-norby-teal font-medium tnum">
                  {formatBRL(totalSaved)}
                </span>{" "}
                rumo aos seus objetivos
              </>
            )}
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium shadow-lg shadow-norby-teal/20" />
            }
          >
            <Plus size={16} /> Nova meta
          </DialogTrigger>
          <DialogContent className="bg-norby-surface border-white/10 text-norby-ivory">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-norby-teal flex items-center justify-center shrink-0">
                  <Target size={20} className="text-norby-night" />
                </div>
                <div>
                  <DialogTitle>Nova meta</DialogTitle>
                  <p className="text-xs text-norby-ivory/50 mt-0.5">
                    Poupança para um objetivo ou orçamento de uma categoria
                  </p>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1">
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

              <div className="flex gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="flex-1 border-white/14 bg-transparent text-norby-ivory/70 hover:bg-white/5"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[1.4] bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
                >
                  {isSubmitting ? "Salvando…" : "Criar meta"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Banner Sugestão da Norby (some quando não há insight) */}
      {insight?.suggested_action && (
        <div className="relative overflow-hidden glass-card border-norby-teal/25 p-6">
          <div
            className="absolute -top-16 -right-8 w-80 h-48 rounded-full pointer-events-none opacity-[0.10]"
            style={{ background: "#2DB5A3", filter: "blur(90px)" }}
          />
          <div className="relative flex items-center gap-5 flex-wrap">
            <div className="flex items-start gap-4 flex-1 min-w-[300px]">
              <AiOrb size={44} className="mt-0.5" />
              <div>
                <div className="text-[11px] font-semibold text-norby-teal-soft tracking-widest mb-1.5">
                  SUGESTÃO DA NORBY
                </div>
                <p className="text-[15px] leading-relaxed text-norby-ivory max-w-xl text-pretty">
                  {insight.suggested_action}
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/ai")}
              className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium shrink-0"
            >
              Conversar com a Norby <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* Grid de metas */}
      <div className="grid grid-cols-3 gap-5">
        {goals.length === 0 && (
          <div className="col-span-3 glass-card p-10 flex flex-col items-center text-center">
            <div className="w-11 h-11 rounded-xl bg-norby-teal/15 flex items-center justify-center mb-3">
              <Target size={20} className="text-norby-teal" />
            </div>
            <p className="text-sm font-medium text-norby-ivory">
              Nenhuma meta ainda
            </p>
            <p className="text-xs text-norby-ivory/50 mt-1 max-w-xs leading-relaxed">
              Crie uma meta de poupança para acompanhar um objetivo, ou um
              orçamento para limitar os gastos de uma categoria.
            </p>
          </div>
        )}

        {goals.map((g) => {
          const isSavings = g.type === "SAVINGS";
          const pct = Math.min(g.progress_pct, 100);
          const over = g.type === "BUDGET" && g.progress_pct >= 100;
          const near = g.type === "BUDGET" && g.progress_pct >= 80 && !over;
          const done = isSavings && g.progress_pct >= 100;
          // Cor da barra: verde p/ SAVINGS (concluída ou não), semântica p/ BUDGET
          const barColor = over
            ? "bg-norby-danger"
            : near
              ? "bg-[#E0B341]"
              : isSavings
                ? "bg-norby-income"
                : "bg-norby-teal";
          const glow = over ? "#E06A4A" : isSavings ? "#5FBF7E" : "#2DB5A3";
          const Icon = isSavings ? PiggyBank : Target;
          const deadline = deadlineLabel(g.deadline);

          return (
            <div
              key={g.id}
              className="group relative overflow-hidden glass-card-hover p-6 flex flex-col"
            >
              <div
                className="absolute -top-12 -right-10 w-36 h-28 rounded-full pointer-events-none opacity-[0.10]"
                style={{ background: glow, filter: "blur(60px)" }}
              />

              {/* topo: ícone + status/prazo */}
              <div className="relative flex items-start justify-between mb-4">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                    isSavings
                      ? "bg-norby-income/15 text-norby-income"
                      : "bg-norby-teal/15 text-norby-teal"
                  }`}
                >
                  <Icon size={19} />
                </div>
                {done ? (
                  <span className="chip bg-norby-income/15 text-norby-income">
                    <Check size={12} /> Concluída
                  </span>
                ) : over ? (
                  <span className="chip bg-norby-danger/15 text-norby-danger">
                    Estourou
                  </span>
                ) : deadline ? (
                  <span className="text-[11px] text-norby-ivory/45">
                    {deadline}
                  </span>
                ) : null}
              </div>

              <p className="relative text-base font-semibold text-norby-ivory mb-0.5">
                {g.name}
              </p>
              <p className="relative text-xs text-norby-ivory/40 mb-4">
                {isSavings ? "Poupança" : `Orçamento · ${g.category}`}
              </p>

              <div className="relative flex items-baseline gap-2 mb-3">
                <Money
                  value={g.current_amount}
                  className="text-2xl font-semibold text-norby-ivory tracking-tight"
                  centsClassName="text-norby-ivory/45"
                />
                <span className="text-sm text-norby-ivory/40">
                  de {formatBRL(g.target_amount)}
                </span>
              </div>

              <div className="relative flex items-center gap-2.5">
                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span
                  className={`text-[13px] font-semibold tnum ${
                    over
                      ? "text-norby-danger"
                      : isSavings
                        ? "text-norby-income"
                        : "text-norby-teal"
                  }`}
                >
                  {g.progress_pct}%
                </span>
              </div>

              <p className="relative text-xs text-norby-ivory/45 mt-3">
                {done
                  ? "Meta alcançada 🎉"
                  : over
                    ? `Ultrapassou em ${formatBRL(parseFloat(g.current_amount) - parseFloat(g.target_amount))}`
                    : `Faltam ${formatBRL(g.remaining)}`}
              </p>

              {/* rodapé: ações */}
              <div className="relative flex items-center justify-end gap-1.5 mt-5 pt-4 border-t border-white/[0.07]">
                {isSavings && (
                  <AmountPromptDialog
                    title={`Aporte em "${g.name}"`}
                    description="Use um valor negativo para corrigir um aporte."
                    submitLabel="Adicionar"
                    errorFallback="Não foi possível salvar o aporte."
                    onSubmit={(amount) => contribute(g.id, amount)}
                    trigger={
                      <button
                        type="button"
                        title="Adicionar aporte"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-norby-teal/25 text-norby-teal text-xs font-medium hover:bg-norby-teal/10 transition-colors"
                      >
                        <Plus size={13} /> Aporte
                      </button>
                    }
                  />
                )}
                <ConfirmDialog
                  title="Remover esta meta?"
                  confirmLabel="Remover"
                  errorFallback="Não foi possível remover a meta."
                  onConfirm={() => deleteGoal(g.id)}
                  trigger={
                    <button
                      type="button"
                      title="Excluir"
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-norby-ivory/50 hover:text-norby-danger hover:border-norby-danger/40 transition-colors"
                    >
                      <Trash2 size={14} />
                      <span className="sr-only">Excluir meta</span>
                    </button>
                  }
                />
              </div>
            </div>
          );
        })}

        {/* Card tracejado "criar" */}
        {goals.length > 0 && (
          <button
            onClick={() => setOpen(true)}
            className="min-h-[236px] rounded-3xl border border-dashed border-white/[0.14] flex flex-col items-center justify-center gap-3 text-norby-ivory/60 hover:border-norby-teal/40 hover:text-norby-ivory hover:bg-white/[0.02] transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-norby-teal/12 flex items-center justify-center">
              <Plus size={20} className="text-norby-teal" />
            </div>
            <span className="text-sm font-medium">Criar nova meta</span>
          </button>
        )}
      </div>
    </div>
  );
}
