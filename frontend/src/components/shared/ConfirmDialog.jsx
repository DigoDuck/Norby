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
import { Input } from "@/components/ui/input";
import { apiErrorMessage, shadcnInputCls } from "@/lib/utils";

/**
 * Diálogo de confirmação reutilizável para ações destrutivas.
 *
 * Substitui `confirm()` + `alert()` nativos: confirma a ação e, se o `onConfirm`
 * (async) falhar, mostra a mensagem de erro da API inline sem fechar o diálogo.
 *
 * `requirePassword` (ações de admin, ADR 0004): pede a senha ATUAL de quem
 * está confirmando, num campo entre a descrição e o erro, e passa como
 * argumento de `onConfirm`. Sem a prop, o comportamento é idêntico ao anterior
 * (chama `onConfirm()` sem argumento).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  errorFallback = "Não foi possível concluir a ação.",
  requirePassword = false,
  onConfirm,
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setError(null); // limpa o erro ao fechar
      setPassword("");
    }
  }

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await onConfirm(requirePassword ? password : undefined);
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

        {requirePassword && (
          <Input
            type="password"
            aria-label="Sua senha atual"
            placeholder="Sua senha atual"
            // "off" evita que o navegador tente casar este campo com um campo
            // de usuário/e-mail vizinho (aqui, a busca) e o preencha sozinho.
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={shadcnInputCls}
          />
        )}

        {error && <p className="text-danger text-xs">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{cancelLabel}</DialogClose>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={loading || (requirePassword && !password)}
            className="bg-danger hover:bg-danger/80 text-accent-contrast disabled:opacity-40"
          >
            {loading ? "..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
