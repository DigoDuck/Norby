import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { walletsApi } from "@/api/wallets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
      setError(
        err.response?.data?.detail || "Não foi possível salvar a carteira.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remover esta carteira e todas as transações?")) return;
    try {
      await walletsApi.delete(id);
      load();
    } catch (err) {
      alert(
        err.response?.data?.detail || "Não foi possível remover a carteira.",
      );
    }
  }

  function openEdit(wallet) {
    setEditing(wallet);
    setForm({ name: wallet.name, balance: wallet.balance });
    setError(null);
    setOpen(true);
  }

  const fmt = (v) =>
    `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const inputCls =
    "bg-white/5 border-white/10 text-norby-ivory placeholder:text-norby-ivory/30";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-norby-ivory tracking-tight">
            Carteiras
          </h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            Gerencie suas contas e cartões
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setError(null);
            }
          }}
        >
          <DialogTrigger
            render={
              <Button
                onClick={() => {
                  setEditing(null);
                  setError(null);
                  setForm({ name: "", balance: "" });
                }}
                className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
              />
            }
          >
            <Plus size={16} className="mr-1" /> Nova Carteira
          </DialogTrigger>
          <DialogContent className="bg-norby-surface border-white/10 text-norby-ivory">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar carteira" : "Nova carteira"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <Input
                placeholder="Nome (ex: Nubank, Caixa)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
              {!editing && (
                <Input
                  type="number"
                  placeholder="Saldo Inicial"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  className={inputCls}
                />
              )}
              {error && <p className="text-norby-danger text-xs">{error}</p>}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
              >
                {saving
                  ? "Salvando..."
                  : editing
                    ? "Salvar alterações"
                    : "Criar carteira"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {wallets.map((w) => (
          <div key={w.id} className="glass-card-hover p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-norby-teal/15 flex items-center justify-center">
                <Wallet size={20} className="text-norby-teal" />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(w)}
                  className="m-1 p-2 rounded-lg text-norby-ivory/40 hover:text-norby-ivory hover:bg-white/5"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(w.id)}
                  className="m-1 p-2 rounded-lg text-norby-ivory/40 hover:text-norby-danger hover:bg-white/5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div>
              <p className="text-norby-ivory/70">{w.name}</p>
              <p className="text-xl font-bold text-norby-ivory mt-1 tnum">
                {fmt(w.balance)}
              </p>
            </div>
            <p className="text-xs text-norby-ivory/40">
              Criado em {new Date(w.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
