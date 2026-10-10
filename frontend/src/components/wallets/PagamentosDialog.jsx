import { useEffect, useRef, useState } from "react";

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
import { ehCartao } from "@/lib/cartao";
import { apiErrorMessage, formatBRL, formatDateBR } from "@/lib/utils";

const POR_PAGINA = 50;

// No cartão, toda transferência é pagamento de fatura; numa conta, é dinheiro
// que saiu ou entrou de outra carteira (issue #219).
const TEXTOS = {
  cartao: {
    titulo: "Pagamentos da fatura",
    descricao: "Excluir um pagamento devolve o valor à conta de origem.",
    lista: "Pagamentos",
    vazio: "Nenhum pagamento registrado.",
    item: "pagamento",
    erro: "os pagamentos",
    erroMais: "Não foi possível carregar mais pagamentos.",
    excluir: "Excluir este pagamento?",
    erroExcluir: "Não foi possível excluir o pagamento.",
  },
  conta: {
    titulo: "Transferências",
    descricao: "Excluir uma transferência devolve o valor à carteira de origem.",
    lista: "Transferências",
    vazio: "Nenhuma transferência registrada.",
    item: "transferência",
    erro: "as transferências",
    erroMais: "Não foi possível carregar mais transferências.",
    excluir: "Excluir esta transferência?",
    erroExcluir: "Não foi possível excluir a transferência.",
  },
};

/**
 * Transferências da carteira, nos dois sentidos, com desfazer. Busca ao abrir,
 * e não na carga da página, que custaria uma requisição por carteira.
 */
export default function PagamentosDialog({ carteira, contas, trigger, onChange }) {
  const textos = ehCartao(carteira) ? TEXTOS.cartao : TEXTOS.conta;
  const [itens, setItens] = useState(null);
  const [total, setTotal] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  // Índice do primeiro item da página que acabou de chegar. Na última página
  // o "Carregar mais" desmonta e o foco cairia no body; vai para o item novo.
  const focarEm = useRef(null);
  const listaRef = useRef(null);
  const nomeDa = (id) => contas.find((c) => c.id === id)?.name ?? "Carteira excluída";

  async function carregar() {
    setError(null);
    try {
      const [resumo, pagina] = await Promise.all([
        transfersApi.summary({ wallet_id: carteira.id }),
        transfersApi.list({ wallet_id: carteira.id, limit: POR_PAGINA, offset: 0 }),
      ]);
      setTotal(resumo.data.count);
      setItens(pagina.data);
    } catch (err) {
      setError(apiErrorMessage(err, `Não foi possível carregar ${textos.erro}.`));
    }
  }

  async function carregarMais() {
    setError(null);
    setBuscando(true);
    try {
      const { data } = await transfersApi.list({ wallet_id: carteira.id, limit: POR_PAGINA, offset: itens.length });
      focarEm.current = itens.length;
      setItens((atual) => [...atual, ...data]);
    } catch (err) {
      setError(apiErrorMessage(err, textos.erroMais));
    } finally {
      setBuscando(false);
    }
  }

  useEffect(() => {
    if (focarEm.current === null) return;
    listaRef.current?.children[focarEm.current]?.focus();
    focarEm.current = null;
  }, [itens]);

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
          <DialogTitle>{textos.titulo}</DialogTitle>
          <DialogDescription>{textos.descricao}</DialogDescription>
        </DialogHeader>

        {/* Falha na busca inicial (abrir ou "Tentar de novo"): sem itens para
            mostrar, o mesmo aviso com retry das outras telas. Falha ao excluir
            aparece dentro do próprio ConfirmDialog da linha; o aviso abaixo é
            só para quando o refetch que SEGUE um excluir bem-sucedido falha e
            a lista antiga fica em tela. */}
        {error && itens === null && <LoadError what={textos.erro} onRetry={carregar} />}
        {itens === null && !error && <p role="status" className="text-sm text-content-2">Carregando…</p>}
        {itens?.length === 0 && <p className="text-sm text-content-2">{textos.vazio}</p>}
        {itens?.length > 0 && (
          <ul
            ref={listaRef}
            aria-label={textos.lista}
            className="max-h-[min(55dvh,26rem)] overflow-y-auto -mx-1 px-1 divide-y divide-line/[0.08]"
          >
            {itens.map((t) => (
              <li key={t.id} tabIndex={-1} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <Money value={t.amount} className="text-sm font-medium text-content" />
                  <p className="text-xs text-content-3">
                    {formatDateBR(t.date)} ·{" "}
                    {t.to_wallet_id === carteira.id
                      ? `de ${nomeDa(t.from_wallet_id)}`
                      : `para ${nomeDa(t.to_wallet_id)}`}
                  </p>
                </div>
                <ConfirmDialog
                  title={textos.excluir}
                  description={`Devolve ${formatBRL(t.amount)} para ${nomeDa(t.from_wallet_id)}.`}
                  confirmLabel="Excluir"
                  errorFallback={textos.erroExcluir}
                  onConfirm={() => excluir(t.id)}
                  trigger={
                    <Button variant="outline" size="sm" aria-label={`Excluir ${textos.item}`}>
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
