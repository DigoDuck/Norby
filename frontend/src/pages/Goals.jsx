import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Target, PiggyBank, ArrowRight, Check, Pencil } from "lucide-react";

import { goalsApi } from "@/api/goals";
import { aiApi } from "@/api/ai";
import { CATEGORIES } from "@/lib/categories";
import { goalSchema } from "@/lib/schemas";
import { apiErrorMessage, formatBRL, inputCls } from "@/lib/utils";
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

// Tipo de META (não de lançamento): nome próprio para não confundir com o
// TRANSACTION_TYPE_OPTIONS compartilhado.
const GOAL_TYPE_OPTIONS = [
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
  // O card tracejado abre o mesmo diálogo do DialogTrigger do topo; sem
  // registrar quem abriu, o foco não volta para o card ao fechar.
  const ultimoGatilho = useRef(null);
  const [serverError, setServerError] = useState(null);
  const [editing, setEditing] = useState(null);
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
      setEditing(null);
      reset(EMPTY_FORM);
    }
  }

  // Abre o dialog em modo edição, pré-preenchido com nome e valor-alvo.
  function abrirEdicao(goal) {
    setEditing(goal);
    setServerError(null);
    reset({ ...EMPTY_FORM, name: goal.name, target_amount: Number(goal.target_amount) });
    setOpen(true);
  }

  async function onSubmit(data) {
    setServerError(null);
    try {
      if (editing) {
        // GoalUpdate aceita SÓ name e target_amount; qualquer outro campo é
        // descartado em silêncio pelo backend.
        await goalsApi.update(editing.id, {
          name: data.name,
          target_amount: data.target_amount,
        });
      } else {
        await goalsApi.create({
          name: data.name,
          type: data.type,
          target_amount: data.target_amount,
          ...(data.type === "SAVINGS"
            ? { current_amount: data.current_amount || 0 }
            : { category: data.category }),
        });
      }
      // Via handleOpenChange (não só setOpen) para limpar `editing` e o
      // formulário: senão "Nova meta" logo depois de editar reabre em modo
      // edição, com o risco de um PUT no id da meta antiga em vez de POST.
      handleOpenChange(false);
      load();
    } catch (err) {
      setServerError(apiErrorMessage(err, "Não foi possível salvar a meta."));
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
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
        <div>
          <h1 className="text-3xl font-bold text-content tracking-tight">
            Suas metas
          </h1>
          <p className="text-content-2 text-sm mt-1">
            {goals.length} {goals.length === 1 ? "meta ativa" : "metas ativas"}
            {totalSaved > 0 && (
              <>
                {" "}· você já guardou{" "}
                <span className="text-accent font-medium tnum">
                  {formatBRL(totalSaved)}
                </span>{" "}
                rumo aos seus objetivos
              </>
            )}
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            // Sem registrar este gatilho, a ref guardava o card tracejado de uma
            // abertura anterior e o foco voltava para o elemento errado.
            onClick={(e) => {
              ultimoGatilho.current = e.currentTarget;
            }}
            render={
              <Button className="bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium" />
            }
          >
            <Plus size={16} /> Nova meta
          </DialogTrigger>
          <DialogContent
            finalFocus={ultimoGatilho}
            className="bg-surface border-line/10 text-content"
          >
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-fill flex items-center justify-center shrink-0">
                  <Target size={20} className="text-accent-contrast" />
                </div>
                <div>
                  <DialogTitle>{editing ? "Editar meta" : "Nova meta"}</DialogTitle>
                  <p className="text-xs text-content-2 mt-0.5">
                    Poupança para um objetivo ou orçamento de uma categoria
                  </p>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1">
              {/* Tipo (edição não altera: GoalUpdate não aceita este campo) */}
              {!editing && (
                <Field label="Tipo" error={errors.type?.message}>
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <Segmented
                        value={field.value}
                        onChange={field.onChange}
                        options={GOAL_TYPE_OPTIONS}
                        ariaLabel="Tipo"
                      />
                    )}
                  />
                </Field>
              )}

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

              {/* Condicional: SAVINGS → já guardado; BUDGET → categoria.
                  Edição não altera nenhum dos dois: GoalUpdate não aceita. */}
              {!editing && (type === "SAVINGS" ? (
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
              ))}

              {serverError && (
                <p className="text-danger text-xs">{serverError}</p>
              )}

              <div className="flex gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="flex-1 border-line/10 bg-transparent text-content-2 hover:bg-state/5"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-[1.4] bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
                >
                  {isSubmitting ? "Salvando…" : editing ? "Salvar" : "Criar meta"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Banner Sugestão da Norby (some quando não há insight) */}
      {insight?.suggested_action && (
        <div className="relative overflow-hidden glass border-accent/25 p-6">
          <div className="relative flex items-center gap-5 flex-wrap">
            <div className="flex min-w-0 flex-1 items-start gap-4 sm:min-w-[300px]">
              <AiOrb size={44} className="mt-0.5" />
              <div>
                <div className="microlabel mb-1.5 text-accent">
                  SUGESTÃO DA NORBY
                </div>
                <p className="text-[15px] leading-relaxed text-content max-w-xl text-pretty">
                  {insight.suggested_action}
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/ai")}
              className="bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium shrink-0"
            >
              Conversar com a Norby <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* Grid de metas */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {goals.length === 0 && (
          <div className="col-span-full glass p-10 flex flex-col items-center text-center">
            <div className="w-11 h-11 rounded-xl bg-accent/[0.15] flex items-center justify-center mb-3">
              <Target size={20} className="text-accent" />
            </div>
            <p className="text-sm font-medium text-content">
              Nenhuma meta ainda
            </p>
            <p className="text-xs text-content-2 mt-1 max-w-xs leading-relaxed">
              Crie uma meta de poupança para acompanhar um objetivo, ou um
              orçamento para limitar os gastos de uma categoria.
            </p>
          </div>
        )}

        {goals.map((g) => {
          const isSavings = g.type === "SAVINGS";
          const pct = Math.min(g.progress_pct, 100);
          const over = g.type === "BUDGET" && g.progress_pct >= 100;
          const done = isSavings && g.progress_pct >= 100;
          const barColor = isSavings ? "bg-income" : "bg-accent";
          const Icon = isSavings ? PiggyBank : Target;
          const deadline = deadlineLabel(g.deadline);

          return (
            <div
              key={g.id}
              className="group relative overflow-hidden glass-hover p-6 flex flex-col"
            >
              {/* topo: tipo textual + status/prazo */}
              <div className="relative flex items-start justify-between mb-4">
                <span className="chip-neutral">
                  <Icon size={12} />
                  {isSavings ? "Reserva" : "Orçamento"}
                </span>
                {done ? (
                  <span className="chip-pos">
                    <Check size={12} /> Concluída
                  </span>
                ) : over ? (
                  <span className="chip-neg">
                    Estourou
                  </span>
                ) : deadline ? (
                  <span className="text-[11px] text-content-2">
                    {deadline}
                  </span>
                ) : null}
              </div>

              <p className="relative text-base font-semibold text-content mb-0.5">
                {g.name}
              </p>
              <p className="relative text-xs text-content-3 mb-4">
                {isSavings ? "Objetivo de reserva" : g.category}
              </p>

              <div className="relative flex items-baseline gap-2 mb-3">
                <Money
                  value={g.current_amount}
                  className="text-2xl font-semibold text-content tracking-tight"
                  centsClassName="text-content-2"
                />
                <span className="text-sm text-content-3">
                  de {formatBRL(g.target_amount)}
                </span>
              </div>

              <div className="relative flex items-center gap-2.5">
                <div
                  className="flex-1 h-2 rounded-full bg-line/[0.06] overflow-hidden"
                  role="progressbar"
                  aria-label={`Progresso de ${g.name}`}
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span
                  className={`text-[13px] font-semibold tnum ${
                    over
                      ? "text-expense"
                      : isSavings
                        ? "text-income"
                        : "text-accent"
                  }`}
                >
                  {g.progress_pct}%
                </span>
              </div>

              <p className="relative text-xs text-content-2 mt-3">
                {done
                  ? "Meta alcançada 🎉"
                  : over
                    ? `Ultrapassou em ${formatBRL(parseFloat(g.current_amount) - parseFloat(g.target_amount))}`
                    : `Faltam ${formatBRL(g.remaining)}`}
              </p>

              {/* rodapé: ações */}
              <div className="relative flex items-center justify-end gap-1.5 mt-5 pt-4 border-t border-line/[0.08]">
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
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-accent/25 text-accent text-xs font-medium hover:bg-accent/10 transition-colors"
                      >
                        <Plus size={13} /> Aporte
                      </button>
                    }
                  />
                )}
                <button
                  type="button"
                  title="Editar"
                  aria-label={`Editar meta ${g.name}`}
                  onClick={(e) => {
                    ultimoGatilho.current = e.currentTarget;
                    abrirEdicao(g);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-line/10 text-content-3 hover:text-accent hover:border-accent/40 transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <ConfirmDialog
                  title="Remover esta meta?"
                  confirmLabel="Remover"
                  errorFallback="Não foi possível remover a meta."
                  onConfirm={() => deleteGoal(g.id)}
                  trigger={
                    <button
                      type="button"
                      title="Excluir"
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-line/10 text-content-3 hover:text-danger hover:border-danger/40 transition-colors"
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
            type="button"
            onClick={(e) => {
              ultimoGatilho.current = e.currentTarget;
              setOpen(true);
            }}
            className="inset-panel min-h-[236px] border-dashed border-line/20 flex flex-col items-center justify-center gap-3 text-content-2 hover:border-accent/40 hover:text-content hover:bg-state/[0.02] transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-accent/[0.12] flex items-center justify-center">
              <Plus size={20} className="text-accent" />
            </div>
            <span className="text-sm font-medium">Criar nova meta</span>
          </button>
        )}
      </div>
    </div>
  );
}
