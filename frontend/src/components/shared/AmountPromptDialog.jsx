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
import { MoneyInput } from "@/components/ui/money-input";
import { apiErrorMessage } from "@/lib/utils";

/**
 * Diálogo com um input de valor validado (R$), no lugar de `prompt()`.
 *
 * Aceita valores negativos (ex.: corrigir um aporte) mas rejeita zero/entrada
 * inválida. Erros da API do `onSubmit` aparecem inline, sem fechar o diálogo.
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
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
          <div className="space-y-1">
            <label htmlFor={inputId} className="text-xs text-content-2">
              Valor
            </label>
            <MoneyInput id={inputId} value={amount} onChange={setAmount} allowNegative />
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
