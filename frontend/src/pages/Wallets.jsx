import { useCallback, useId, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { walletsApi } from "@/api/wallets";
import { apiErrorMessage, formatBRL, shadcnInputCls } from "@/lib/utils";
import { OPCOES_BANCO } from "@/lib/bancos";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import Money from "@/components/shared/Money";
import WalletMark from "@/components/shared/WalletMark";
import { LoadError, LoadingCards } from "@/components/shared/LoadState";
import { useLoad } from "@/lib/useLoad";
import { usePlano } from "@/lib/plan";
import PremiumLock from "@/components/shared/PremiumLock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", balance: "", bank: "" });
  const nomeId = useId();
  const saldoId = useId();
  const bancoId = useId();
  // Qual botão abriu o diálogo. O Dialog é controlado por estado, sem
  // DialogTrigger, então o Base UI não tem para onde devolver o foco ao fechar
  // e o usuário de teclado caía no body.
  const ultimoGatilho = useRef(null);

  const load = useCallback(async () => {
    setWallets((await walletsApi.list()).data);
  }, []);
  const { status, reload } = useLoad(load);
  const { limiteCarteiras } = usePlano();
  // No limite do gratuito, "nova carteira" daria 403 depois do form preenchido.
  const noLimite = limiteCarteiras !== null && wallets.length >= limiteCarteiras;

  async function handleSave() {
    if (!form.name.trim()) return setError("Informe um nome.");
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        // Saldo não é editável: deriva das transações. Edita só o nome.
        // `bank: null` seria descartado pelo `exclude_none` do backend, então
        // "sem banco" só existe na criação. Trocar de banco funciona.
        await walletsApi.update(editing.id, {
          name: form.name,
          ...(form.bank ? { bank: form.bank } : {}),
        });
      } else {
        await walletsApi.create({
          name: form.name,
          balance: form.balance === "" ? 0 : form.balance,
          ...(form.bank ? { bank: form.bank } : {}),
        });
      }
      setOpen(false);
      setEditing(null);
      setForm({ name: "", balance: "", bank: "" });
      load();
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível salvar a carteira."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteWallet(id) {
    await walletsApi.delete(id);
    load();
  }

  function openNew(e) {
    ultimoGatilho.current = e?.currentTarget ?? null;
    setEditing(null);
    setError(null);
    setForm({ name: "", balance: "", bank: "" });
    setOpen(true);
  }

  function openEdit(wallet, e) {
    ultimoGatilho.current = e?.currentTarget ?? null;
    setEditing(wallet);
    setForm({ name: wallet.name, balance: wallet.balance, bank: wallet.bank || "" });
    setError(null);
    setOpen(true);
  }

  function handleOpenChange(v) {
    setOpen(v);
    if (!v) {
      setEditing(null);
      setError(null);
    }
  }


  const totalBalance = wallets.reduce((s, w) => s + parseFloat(w.balance), 0);

  return (
    <div className="space-y-6">
      {/* Header com estatística viva */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
        <div>
          <h1 className="text-3xl font-bold text-content tracking-tight">
            Carteiras
          </h1>
          <p className="text-content-2 text-sm mt-1">
            {status === "ok" ? (
              <>
                {wallets.length}{" "}
                {wallets.length === 1 ? "carteira" : "carteiras"} · saldo total{" "}
                <span className="text-accent font-medium tnum">
                  {formatBRL(totalBalance)}
                </span>
                {noLimite && ` · ${wallets.length} de ${limiteCarteiras} no plano gratuito`}
              </>
            ) : (
              <span aria-hidden="true" className="inline-block h-3.5 w-48 rounded-full bg-line/[0.07] motion-safe:animate-pulse align-middle" />
            )}
          </p>
        </div>
        <Button
          onClick={openNew}
          disabled={noLimite}
          className="font-medium"
        >
          <Plus size={16} /> Nova carteira
        </Button>
      </div>

      {/* Dialog compartilhado por criar/editar */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          finalFocus={ultimoGatilho}
          className="bg-surface border-line/10 text-content"
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-fill flex items-center justify-center shrink-0">
                <Wallet size={20} className="text-accent-contrast" />
              </div>
              <div>
                <DialogTitle>
                  {editing ? "Editar carteira" : "Nova carteira"}
                </DialogTitle>
                <p className="text-xs text-content-2 mt-0.5">
                  {editing
                    ? "Atualize o nome desta carteira"
                    : "Adicione uma conta para acompanhar"}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-1">
            <div>
              <label htmlFor={nomeId} className="block text-xs font-medium text-content-2 mb-2">
                Nome da carteira
              </label>
              <Input
                id={nomeId}
                placeholder="Ex.: Nubank, Caixa, Carteira…"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={shadcnInputCls}
              />
            </div>
            <div>
              <label htmlFor={bancoId} className="block text-xs font-medium text-content-2 mb-2">
                Banco <span className="text-content-3">(opcional)</span>
              </label>
              <Select
                id={bancoId}
                value={form.bank}
                placeholder="Sem banco"
                options={OPCOES_BANCO}
                onChange={(v) => setForm({ ...form, bank: v })}
              />
            </div>
            {!editing && (
              <div>
                <label htmlFor={saldoId} className="block text-xs font-medium text-content-2 mb-2">
                  Saldo inicial
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-content-3 pointer-events-none">
                    R$
                  </span>
                  <MoneyInput
                    id={saldoId}
                    value={form.balance}
                    onChange={(n) => setForm({ ...form, balance: n })}
                    className={`${shadcnInputCls} pl-10`}
                  />
                </div>
              </div>
            )}
            {error && <p className="text-danger text-xs">{error}</p>}
            <div className="flex gap-2.5 pt-1">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="flex-1 border-line/10 bg-transparent text-content-2 hover:bg-state/5"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-[1.4] font-medium"
              >
                {saving
                  ? "Salvando…"
                  : editing
                    ? "Salvar alterações"
                    : "Criar carteira"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Grid de carteiras */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {status === "loading" && <LoadingCards count={3} className="min-h-[196px]" />}
        {status === "error" && (
          <LoadError what="suas carteiras" onRetry={reload} className="col-span-full" />
        )}

        {status === "ok" && wallets.length === 0 && (
          <div className="col-span-full panel p-10 flex flex-col items-center text-center">
            <div className="w-11 h-11 rounded-xl bg-accent/[0.15] flex items-center justify-center mb-3">
              <Wallet size={20} className="text-accent" />
            </div>
            <p className="text-sm font-medium text-content">
              Nenhuma carteira ainda
            </p>
            <p className="text-xs text-content-2 mt-1 max-w-xs leading-relaxed">
              Crie sua primeira carteira (conta, cartão ou dinheiro) para
              começar a registrar transações.
            </p>
          </div>
        )}

        {wallets.map((w) => {
          return (
            <div
              key={w.id}
              className="group relative overflow-hidden panel-hover p-6 flex min-h-[196px] flex-col"
            >
              <div className="relative flex items-start justify-between mb-5">
                <WalletMark wallet={w} />
              </div>

              <p className="relative text-sm text-content-2 mb-1">
                {w.name}
              </p>
              <Money
                value={w.balance}
                className="relative text-2xl font-semibold text-content tnum"
              />

              <div className="relative flex items-center justify-between mt-auto pt-4 border-t border-line/[0.08]">
                <span className="text-[11px] text-content-3">
                  Criada em {new Date(w.created_at).toLocaleDateString("pt-BR")}
                </span>
                <div className="flex items-center gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => openEdit(w, e)}
                    title="Editar"
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-line/10 text-content-3 hover:text-content hover:border-line/20 transition-colors"
                  >
                    <Pencil size={14} />
                    <span className="sr-only">Editar carteira</span>
                  </button>
                  <ConfirmDialog
                    title="Remover esta carteira?"
                    description="A carteira e todas as suas transações serão removidas."
                    confirmLabel="Remover"
                    errorFallback="Não foi possível remover a carteira."
                    onConfirm={() => deleteWallet(w.id)}
                    trigger={
                      <button
                        type="button"
                        title="Excluir"
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-line/10 text-content-3 hover:text-danger hover:border-danger/40 transition-colors"
                      >
                        <Trash2 size={14} />
                        <span className="sr-only">Excluir carteira</span>
                      </button>
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}

        {status === "ok" && noLimite && (
          <div className="inset-panel min-h-[196px] border-dashed border-line/20 flex items-center justify-center p-6">
            <PremiumLock
              title="Mais carteiras no Norby+"
              text={`O plano gratuito tem ${limiteCarteiras} carteiras.`}
            />
          </div>
        )}

        {/* Card tracejado "adicionar" */}
        {status === "ok" && wallets.length > 0 && !noLimite && (
          <button
            type="button"
            onClick={openNew}
            className="inset-panel min-h-[196px] border-dashed border-line/20 flex flex-col items-center justify-center gap-3 text-content-2 hover:border-accent/40 hover:text-content hover:bg-state/[0.02] transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-accent/[0.12] flex items-center justify-center">
              <Plus size={20} className="text-accent" />
            </div>
            <span className="text-sm font-medium">Adicionar carteira</span>
          </button>
        )}
      </div>
    </div>
  );
}
