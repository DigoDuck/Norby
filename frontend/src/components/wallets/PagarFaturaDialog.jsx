import { useId, useState } from "react";

import { transfersApi } from "@/api/transfers";
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
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { apiErrorMessage, shadcnInputCls, todayInput } from "@/lib/utils";

// Fatura atual = o negativo do saldo. Cartão em crédito ou zerado não deve nada.
const faturaDe = (cartao) => Math.max(0, -Number(cartao.balance));

// GET /wallets/ vem em created_at desc (mais nova primeiro), então contas[0]
// era a conta MAIS NOVA — sem querer, o padrão de "de onde sai o pagamento".
// A mais antiga costuma ser a conta principal de quem usa o app; sem
// created_at em nenhuma conta (ex.: dado de teste), cai no último item.
function contaMaisAntiga(contas) {
  let escolhida = null;
  for (const c of contas) {
    if (!c.created_at) continue;
    if (!escolhida || new Date(c.created_at) < new Date(escolhida.created_at)) escolhida = c;
  }
  return escolhida ?? contas[contas.length - 1];
}

/**
 * Pagar a fatura = transferir de uma conta para o cartão. Não é despesa: o
 * gasto já foi contado quando cada compra entrou no cartão (ADR 0005).
 */
export default function PagarFaturaDialog({ cartao, contas, trigger, onDone }) {
  const origemId = useId();
  const valorId = useId();
  const dataId = useId();
  const [open, setOpen] = useState(false);
  const [origem, setOrigem] = useState("");
  const [valor, setValor] = useState(0);
  const [data, setData] = useState(todayInput());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(v) {
    setOpen(v);
    if (v) {
      // Reabre sempre com a fatura do momento e a conta mais antiga.
      setValor(faturaDe(cartao));
      setOrigem(contas.length ? contaMaisAntiga(contas).id : "");
      setData(todayInput());
      setError(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valor || valor <= 0) return setError("Informe um valor.");
    if (!origem) return setError("Escolha a conta de origem.");
    setError(null);
    setLoading(true);
    try {
      await transfersApi.create({
        from_wallet_id: origem,
        to_wallet_id: cartao.id,
        amount: valor,
        date: data,
        description: `Pagamento da fatura: ${cartao.name}`,
      });
      setOpen(false);
      onDone?.();
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível registrar o pagamento."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar fatura</DialogTitle>
          <DialogDescription>
            O valor sai da conta e quita o cartão. Não conta como gasto de novo.
          </DialogDescription>
        </DialogHeader>

        {contas.length === 0 ? (
          <p className="text-sm text-content-2">
            Crie uma conta para registrar de onde sai o pagamento.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor={origemId} className="block text-xs font-medium text-content-2 mb-2">
                Pagar com
              </label>
              <Select
                id={origemId}
                value={origem}
                options={contas.map((c) => ({ value: c.id, label: c.name }))}
                onChange={setOrigem}
              />
            </div>
            <div>
              <label htmlFor={valorId} className="block text-xs font-medium text-content-2 mb-2">
                Valor
              </label>
              <MoneyInput id={valorId} value={valor} onChange={setValor} className={shadcnInputCls} />
            </div>
            <div>
              <label htmlFor={dataId} className="block text-xs font-medium text-content-2 mb-2">
                Data
              </label>
              <Input
                id={dataId}
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={shadcnInputCls}
              />
            </div>

            {error && <p className="text-danger text-xs">{error}</p>}

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
              <Button type="submit" disabled={loading} className="font-medium">
                {loading ? "Registrando…" : "Confirmar pagamento"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
