import { useState } from "react";

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
import { apiErrorMessage } from "@/lib/utils";

/**
 * Diálogo de confirmação reutilizável para ações destrutivas.
 *
 * Substitui `confirm()` + `alert()` nativos: confirma a ação e, se o `onConfirm`
 * (async) falhar, mostra a mensagem de erro da API inline sem fechar o diálogo.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  errorFallback = "Não foi possível concluir a ação.",
  onConfirm,
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) setError(null); // limpa o erro ao fechar
  }

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
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

        {error && <p className="text-norby-danger text-xs">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{cancelLabel}</DialogClose>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="bg-norby-danger hover:bg-norby-danger/80 text-norby-ivory disabled:opacity-40"
          >
            {loading ? "..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
