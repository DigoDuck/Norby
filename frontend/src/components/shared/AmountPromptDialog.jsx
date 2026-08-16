import { useId, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { apiErrorMessage } from "@/lib/utils";

// "positive" | "negative" em vez de true/false: são rótulos de opção do
// Segmented, não um segundo estado de sinal — o valor real continua sendo só
// `amount` (ver handleSignChange).
const SIGN_OPTIONS = [
  { value: "positive", label: "Aporte" },
  { value: "negative", label: "Correção" },
];

/**
 * Diálogo com um input de valor validado (R$), no lugar de `prompt()`.
 *
 * Aceita valores negativos (ex.: corrigir um aporte) mas rejeita zero/entrada
 * inválida. Erros da API do `onSubmit` aparecem inline, sem fechar o diálogo.
 *
 * allowNegative fixo em `true`: hoje só existe um uso (aporte de meta, em
 * Goals.jsx), que sempre aceita correção. Quando surgir um segundo uso sem
 * essa necessidade, isso vira prop — não antes, pra não carregar uma opção
 * que nenhum call site usa.
 */
export function AmountPromptDialog({
  trigger,
  title,
  description,
  submitLabel = "Confirmar",
  errorFallback = "Não foi possível concluir a ação.",
  onSubmit,
}) {
  const inputId = useId();
  const allowNegative = true;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Deriva do próprio `amount` (fonte única): nenhum estado de sinal
  // separado. Em 0 é um no-op, igual ao atalho de teclado "-" do
  // MoneyInput — não há sinal pra "prender" antes de existir magnitude.
  function handleSignChange(v) {
    const magnitude = Math.abs(amount);
    setAmount(v === "negative" ? -magnitude : magnitude);
  }

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setAmount(0);
      setError(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (amount === 0) {
      setError("Informe um valor diferente de zero.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(amount);
      handleOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, errorFallback));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {allowNegative && (
            <Field label="Tipo de lançamento">
              <Segmented
                value={amount < 0 ? "negative" : "positive"}
                onChange={handleSignChange}
                options={SIGN_OPTIONS}
                ariaLabel="Tipo de lançamento"
              />
            </Field>
          )}

          <div className="space-y-1">
            <label htmlFor={inputId} className="text-xs text-content-2">
              Valor
            </label>
            <MoneyInput id={inputId} value={amount} onChange={setAmount} allowNegative={allowNegative} />
          </div>

          {error && <p className="text-danger text-xs">{error}</p>}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button
              type="submit"
              disabled={loading}
              className="bg-accent-fill hover:bg-accent-fill/90 text-accent-contrast font-medium disabled:opacity-40"
            >
              {loading ? "..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
