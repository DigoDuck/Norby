import { useEffect, useId, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { walletsApi } from "@/api/wallets";
import { apiErrorMessage, formatBRL, shadcnInputCls } from "@/lib/utils";
import { CHART_SERIES, hashIndex } from "@/lib/palette";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import Money from "@/components/shared/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Cor do chip do ícone, determinística pelo nome da carteira (só apresentação).
const chipColor = (name) => CHART_SERIES[hashIndex(name, CHART_SERIES.length)];

export default function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", balance: "" });
  const nomeId = useId();
  const saldoId = useId();
  // Qual botão abriu o diálogo. O Dialog é controlado por estado, sem
  // DialogTrigger, então o Base UI não tem para onde devolver o foco ao fechar
  // e o usuário de teclado caía no body.
  const ultimoGatilho = useRef(null);

  async function load() {
    const res = await walletsApi.list();
    setWallets(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    if (!form.name.trim()) return setError("Informe um nome.");
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        // Saldo não é editável: deriva das transações. Edita só o nome.
        await walletsApi.update(editing.id, { name: form.name });
      } else {
        await walletsApi.create({
          name: form.name,
          balance: form.balance === "" ? 0 : form.balance,
        });
      }
      setOpen(false);
      setEditing(null);
      setForm({ name: "", balance: "" });
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
    setForm({ name: "", balance: "" });
    setOpen(true);
  }

  function openEdit(wallet, e) {
    ultimoGatilho.current = e?.currentTarget ?? null;
    setEditing(wallet);
    setForm({ name: wallet.name, balance: wallet.balance });
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
            {wallets.length}{" "}
            {wallets.length === 1 ? "carteira" : "carteiras"} · saldo total{" "}
            <span className="text-accent font-medium tnum">
              {formatBRL(totalBalance)}
            </span>
          </p>
        </div>
        <Button
          onClick={openNew}
          className="bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
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
            {!editing && (
              <div>
                <label htmlFor={saldoId} className="block text-xs font-medium text-content-2 mb-2">
                  Saldo inicial
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-content-3 pointer-events-none">
                    R$
                  </span>
                  <Input
                    id={saldoId}
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={form.balance}
                    onChange={(e) =>
                      setForm({ ...form, balance: e.target.value })
                    }
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
                className="flex-[1.4] bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
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
        {wallets.length === 0 && (
          <div className="col-span-full glass p-10 flex flex-col items-center text-center">
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
          const color = chipColor(w.name);
          return (
            <div
              key={w.id}
              className="group relative overflow-hidden glass-hover p-6 flex min-h-[196px] flex-col"
            >
              <div className="relative flex items-start justify-between mb-5">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-semibold"
                  style={{
                    background: `color-mix(in srgb, ${color} 13%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
                    color,
                  }}
                >
                  {w.name?.[0]?.toUpperCase() || "?"}
                </div>
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

        {/* Card tracejado "adicionar" */}
        {wallets.length > 0 && (
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
