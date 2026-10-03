import { useState } from "react";

import { transfersApi } from "@/api/transfers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import Money from "@/components/shared/Money";
import { LoadError } from "@/components/shared/LoadState";
import { apiErrorMessage, formatBRL, formatDateBR } from "@/lib/utils";

const POR_PAGINA = 50;

/**
 * Pagamentos já registrados para o cartão, com desfazer. Busca ao abrir, e
 * não na carga da página, que custaria uma requisição por cartão.
 */
export default function PagamentosDialog({ cartao, contas, trigger, onChange }) {
  const [itens, setItens] = useState(null);
  const [total, setTotal] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const nomeDa = (id) => contas.find((c) => c.id === id)?.name ?? "Carteira excluída";

  async function carregar() {
    setError(null);
    try {
      const [resumo, pagina] = await Promise.all([
        transfersApi.summary({ wallet_id: cartao.id }),
        transfersApi.list({ wallet_id: cartao.id, limit: POR_PAGINA, offset: 0 }),
      ]);
      setTotal(resumo.data.count);
      setItens(pagina.data);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível carregar os pagamentos."));
    }
  }

  async function carregarMais() {
    setError(null);
    setBuscando(true);
    try {
      const { data } = await transfersApi.list({ wallet_id: cartao.id, limit: POR_PAGINA, offset: itens.length });
      setItens((atual) => [...atual, ...data]);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível carregar mais pagamentos."));
    } finally {
      setBuscando(false);
    }
  }

  // Reabrir com a lista da vez anterior ainda em tela mentia o "Carregando…":
  // limpa os dois antes de buscar de novo.
  function aoAbrir(aberto) {
    if (!aberto) return;
    setItens(null);
    setTotal(null);
    setError(null);
    carregar();
  }

  async function excluir(id) {
    await transfersApi.delete(id);
    await carregar();
    onChange?.();
  }

  return (
    <Dialog onOpenChange={aoAbrir}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagamentos da fatura</DialogTitle>
          <DialogDescription>Excluir um pagamento devolve o valor à conta de origem.</DialogDescription>
        </DialogHeader>

        {/* Falha na busca inicial (abrir ou "Tentar de novo"): sem itens para
            mostrar, o mesmo aviso com retry das outras telas. Falha ao excluir
            aparece dentro do próprio ConfirmDialog da linha; o aviso abaixo é
            só para quando o refetch que SEGUE um excluir bem-sucedido falha e
            a lista antiga fica em tela. */}
        {error && itens === null && <LoadError what="os pagamentos" onRetry={carregar} />}
        {itens === null && !error && <p role="status" className="text-sm text-content-2">Carregando…</p>}
        {itens?.length === 0 && <p className="text-sm text-content-2">Nenhum pagamento registrado.</p>}
        {itens?.length > 0 && (
          <ul
            aria-label="Pagamentos"
            className="max-h-[min(55dvh,26rem)] overflow-y-auto -mx-1 px-1 divide-y divide-line/[0.08]"
          >
            {itens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <Money value={t.amount} className="text-sm font-medium text-content" />
                  <p className="text-xs text-content-3">
                    {formatDateBR(t.date)} ·{" "}
                    {t.to_wallet_id === cartao.id
                      ? `de ${nomeDa(t.from_wallet_id)}`
                      : `para ${nomeDa(t.to_wallet_id)}`}
                  </p>
                </div>
                <ConfirmDialog
                  title="Excluir este pagamento?"
                  description={`Devolve ${formatBRL(t.amount)} para ${nomeDa(t.from_wallet_id)}.`}
                  confirmLabel="Excluir"
                  errorFallback="Não foi possível excluir o pagamento."
                  onConfirm={() => excluir(t.id)}
                  trigger={
                    <Button variant="outline" size="sm" aria-label="Excluir pagamento">
                      Excluir
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {itens?.length > 0 && itens.length < total && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-content-3">Mostrando {itens.length} de {total}</p>
            <Button variant="outline" size="sm" onClick={carregarMais} disabled={buscando}>
              Carregar mais
            </Button>
          </div>
        )}
        {error && itens !== null && <p className="text-danger text-xs">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
