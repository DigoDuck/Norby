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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black">Carteiras</h1>
          <p className="text-black/80 text-sm mt-1">
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
                className="bg-violet-600 hover:bg-violet-500 text-white"
              />
            }
          >
            <Plus size={16} className="mr-1" /> Nova Carteira
          </DialogTrigger>
          <DialogContent className="bg-[#ffffff96] border-black/10 text-black">
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
                className="bg-black/5 border-black/10 text-black placeholder:text-black/30"
              />
              {!editing && (
                <Input
                  type="number"
                  placeholder="Saldo Inicial"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  className="bg-black/5 border-black/10 text-black placeholder:text-black/30"
                />
              )}
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white"
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
          <div key={w.id} className="glass-card p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center">
                <Wallet size={20} className="text-violet-600" />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(w)}
                  className=" m-1 p-2 rounded-lg text-black/40 hover:text-black hover:bg-black/5"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(w.id)}
                  className=" m-1 p-2 rounded-lg text-black/40 hover:text-red-500 hover:bg-black/5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div>
              <p className="text-black/80">{w.name}</p>
              <p className="text-xl font-bold text-black mt-1">
                {fmt(w.balance)}
              </p>
            </div>
            <p className="text-xs text-black/50">
              Criado em {new Date(w.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
