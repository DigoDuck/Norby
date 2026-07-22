import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { walletsApi } from "@/api/wallets";
import { apiErrorMessage, formatBRL } from "@/lib/utils";
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
// Mesma paleta categórica do donut do dashboard; renderizada em tom suave.
const CHIP_COLORS = [
  "#2DB5A3", "#5B8DEF", "#E0B341", "#E0725C", "#7BD88F", "#6FD4C6",
];
function chipColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CHIP_COLORS[hash % CHIP_COLORS.length];
}

export default function Wallets() {
  const [wallets, setWallets] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", balance: "" });

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

  function openNew() {
    setEditing(null);
    setError(null);
    setForm({ name: "", balance: "" });
    setOpen(true);
  }

  function openEdit(wallet) {
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

  const inputCls =
    "bg-norby-night border-white/10 text-norby-ivory placeholder:text-norby-ivory/30";

  const totalBalance = wallets.reduce((s, w) => s + parseFloat(w.balance), 0);

  return (
    <div className="space-y-6">
      {/* Header com estatística viva */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-norby-ivory tracking-tight">
            Carteiras
          </h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            {wallets.length}{" "}
            {wallets.length === 1 ? "carteira" : "carteiras"} · saldo total{" "}
            <span className="text-norby-teal font-medium tnum">
              {formatBRL(totalBalance)}
            </span>
          </p>
        </div>
        <Button
          onClick={openNew}
          className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium shadow-lg shadow-norby-teal/20"
        >
          <Plus size={16} /> Nova carteira
        </Button>
      </div>

      {/* Dialog compartilhado por criar/editar */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-norby-surface border-white/10 text-norby-ivory">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-norby-teal flex items-center justify-center shrink-0">
                <Wallet size={20} className="text-norby-night" />
              </div>
              <div>
                <DialogTitle>
                  {editing ? "Editar carteira" : "Nova carteira"}
                </DialogTitle>
                <p className="text-xs text-norby-ivory/50 mt-0.5">
                  {editing
                    ? "Atualize o nome desta carteira"
                    : "Adicione uma conta para acompanhar"}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-1">
            <div>
              <label className="block text-xs font-medium text-norby-ivory/65 mb-2">
                Nome da carteira
              </label>
              <Input
                placeholder="Ex.: Nubank, Caixa, Carteira…"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </div>
            {!editing && (
              <div>
                <label className="block text-xs font-medium text-norby-ivory/65 mb-2">
                  Saldo inicial
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-norby-ivory/40 pointer-events-none">
                    R$
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={form.balance}
                    onChange={(e) =>
                      setForm({ ...form, balance: e.target.value })
                    }
                    className={`${inputCls} pl-10`}
                  />
                </div>
              </div>
            )}
            {error && <p className="text-norby-danger text-xs">{error}</p>}
            <div className="flex gap-2.5 pt-1">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="flex-1 border-white/14 bg-transparent text-norby-ivory/70 hover:bg-white/5"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-[1.4] bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
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
      <div className="grid grid-cols-3 gap-5">
          {wallets.length === 0 && (
            <div className="col-span-3 glass-card p-10 flex flex-col items-center text-center">
              <div className="w-11 h-11 rounded-xl bg-norby-teal/15 flex items-center justify-center mb-3">
                <Wallet size={20} className="text-norby-teal" />
              </div>
              <p className="text-sm font-medium text-norby-ivory">
                Nenhuma carteira ainda
              </p>
              <p className="text-xs text-norby-ivory/50 mt-1 max-w-xs leading-relaxed">
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
                className="group relative overflow-hidden glass-card-hover p-6 flex flex-col"
              >
                {/* glow radial sutil no canto (padrão dos rascunhos) */}
                <div
                  className="absolute -top-12 -right-10 w-36 h-28 rounded-full pointer-events-none opacity-[0.10]"
                  style={{ background: color, filter: "blur(60px)" }}
                />
                <div className="relative flex items-start justify-between mb-5">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-semibold"
                    style={{
                      background: `${color}22`,
                      border: `1px solid ${color}3d`,
                      color,
                    }}
                  >
                    {w.name?.[0]?.toUpperCase() || "?"}
                  </div>
                </div>

                <p className="relative text-sm text-norby-ivory/60 mb-1">
                  {w.name}
                </p>
                <Money
                  value={w.balance}
                  className="relative text-[28px] font-semibold text-norby-ivory tracking-tight"
                />

                <div className="relative flex items-center justify-between mt-5 pt-4 border-t border-white/[0.07]">
                  <span className="text-[11px] text-norby-ivory/40">
                    Criada em {new Date(w.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEdit(w)}
                      title="Editar"
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-norby-ivory/50 hover:text-norby-ivory hover:border-white/20 transition-colors"
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
                          title="Excluir"
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-norby-ivory/50 hover:text-norby-danger hover:border-norby-danger/40 transition-colors"
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
              onClick={openNew}
              className="min-h-[196px] rounded-3xl border border-dashed border-white/[0.14] flex flex-col items-center justify-center gap-3 text-norby-ivory/60 hover:border-norby-teal/40 hover:text-norby-ivory hover:bg-white/[0.02] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-norby-teal/12 flex items-center justify-center">
                <Plus size={20} className="text-norby-teal" />
              </div>
              <span className="text-sm font-medium">Adicionar carteira</span>
          </button>
        )}
      </div>
    </div>
  );
}
