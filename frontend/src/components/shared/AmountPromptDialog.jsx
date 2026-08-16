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

// "positive" | "negative": rótulos de opção do Segmented.
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
  // Magnitude e sinal são grandezas separadas, não um valor único. Sinal é
  // uma intenção do usuário (clique no Segmented) que precisa sobreviver à
  // magnitude zero: derivar o Segmented de `amount < 0` quebra porque
  // Math.abs(0) * -1 é -0, e "-0 < 0" é false em JS — a seleção voltaria
  // sozinha para "Aporte" na frente do usuário. O Segmented manda no sinal,
  // o campo manda na magnitude; nenhum dos dois deriva do outro em render.
  const [magnitude, setMagnitude] = useState(0);
  const [sign, setSign] = useState(1);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const amount = magnitude * sign;

  function handleSignChange(v) {
    setSign(v === "negative" ? -1 : 1);
  }

  // MoneyInput manda na magnitude e também carrega o sinal quando o texto
  // digitado/colado tem um (ver money-input.jsx). v === 0 não carrega sinal
  // nenhum (campo limpo) — preserva o sinal atual em vez de forçar positivo.
  function handleAmountChange(v) {
    setMagnitude(Math.abs(v));
    if (v !== 0) setSign(v < 0 ? -1 : 1);
  }

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setMagnitude(0);
      setSign(1);
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
                value={sign === -1 ? "negative" : "positive"}
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
            <MoneyInput id={inputId} value={amount} onChange={handleAmountChange} allowNegative={allowNegative} />
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
