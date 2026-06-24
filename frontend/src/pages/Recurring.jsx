import { useEffect, useState } from "react";
import { Plus, Trash2, Repeat, Pause, Play } from "lucide-react";
import { recurringApi } from "@/api/recurring";
import { walletsApi } from "@/api/wallets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const inputCls =
  "bg-white/5 border-white/10 text-norby-ivory placeholder:text-norby-ivory/30";
const emptyForm = {
  wallet_id: "", type: "EXPENSE", amount: "", category: "",
  frequency: "MONTHLY", day_of_month: "1", weekday: "0",
};

export default function Recurring() {
  const [items, setItems] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const [r, w] = await Promise.all([recurringApi.list(), walletsApi.list()]);
    setItems(r.data);
    setWallets(w.data);
  }
  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    if (!form.wallet_id) return setError("Selecione uma carteira.");
    if (!form.amount || Number(form.amount) <= 0) return setError("O valor deve ser maior que zero.");
    if (!form.category.trim()) return setError("Informe a categoria.");
    setSaving(true);
    setError(null);
    const payload = {
      wallet_id: form.wallet_id,
      type: form.type,
      amount: form.amount,
      category: form.category,
      frequency: form.frequency,
      ...(form.frequency === "MONTHLY"
        ? { day_of_month: Number(form.day_of_month) }
        : { weekday: Number(form.weekday) }),
    };
    try {
      await recurringApi.create(payload);
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Não foi possível salvar a recorrência.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    await recurringApi.update(item.id, { active: !item.active });
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Remover esta recorrência?")) return;
    await recurringApi.delete(id);
    load();
  }

  const fmt = (v) =>
    `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const cadence = (it) =>
    it.frequency === "MONTHLY"
      ? `Mensal · dia ${it.day_of_month}`
      : `Semanal · ${WEEKDAYS[it.weekday]}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-norby-ivory tracking-tight">
            Recorrências
          </h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            Contas e receitas que se repetem automaticamente
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
          <DialogTrigger
            render={
              <Button
                onClick={() => { setForm(emptyForm); setError(null); }}
                className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
              />
            }
          >
            <Plus size={16} className="mr-1" /> Nova Recorrência
          </DialogTrigger>
          <DialogContent className="bg-norby-surface border-white/10 text-norby-ivory">
            <DialogHeader>
              <DialogTitle>Nova recorrência</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <select
                value={form.wallet_id}
                onChange={(e) => setForm({ ...form, wallet_id: e.target.value })}
                className={`w-full rounded-md px-3 py-2 ${inputCls}`}
              >
                <option value="">Selecione a carteira…</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={`w-full rounded-md px-3 py-2 ${inputCls}`}
              >
                <option value="EXPENSE">Despesa</option>
                <option value="INCOME">Receita</option>
              </select>
              <Input
                type="number" placeholder="Valor" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={inputCls}
              />
              <Input
                placeholder="Categoria" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputCls}
              />
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                className={`w-full rounded-md px-3 py-2 ${inputCls}`}
              >
                <option value="MONTHLY">Mensal</option>
                <option value="WEEKLY">Semanal</option>
              </select>
              {form.frequency === "MONTHLY" ? (
                <Input
                  type="number" min="1" max="28" placeholder="Dia do mês (1-28)"
                  value={form.day_of_month}
                  onChange={(e) => setForm({ ...form, day_of_month: e.target.value })}
                  className={inputCls}
                />
              ) : (
                <select
                  value={form.weekday}
                  onChange={(e) => setForm({ ...form, weekday: e.target.value })}
                  className={`w-full rounded-md px-3 py-2 ${inputCls}`}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              )}
              {error && <p className="text-norby-danger text-xs">{error}</p>}
              <Button
                onClick={handleSave} disabled={saving}
                className="w-full bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
              >
                {saving ? "Salvando…" : "Criar recorrência"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {items.length === 0 && (
          <p className="text-norby-ivory/40 text-sm">Nenhuma recorrência ainda.</p>
        )}
        {items.map((it) => (
          <div key={it.id} className="glass-card-hover p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-norby-teal/15 flex items-center justify-center">
              <Repeat size={18} className="text-norby-teal" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-norby-ivory font-medium truncate">
                {it.category}{" "}
                <span className={it.type === "INCOME" ? "text-norby-income" : "text-norby-ivory/50"}>
                  · {it.type === "INCOME" ? "+" : "−"} {fmt(it.amount)}
                </span>
              </p>
              <p className="text-xs text-norby-ivory/40">
                {cadence(it)} · próx. {new Date(it.next_run_date).toLocaleDateString("pt-BR")}
                {!it.active && " · pausada"}
              </p>
            </div>
            <button
              onClick={() => toggleActive(it)}
              className="p-2 rounded-lg text-norby-ivory/40 hover:text-norby-ivory hover:bg-white/5"
              title={it.active ? "Pausar" : "Retomar"}
            >
              {it.active ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => handleDelete(it.id)}
              className="p-2 rounded-lg text-norby-ivory/40 hover:text-norby-danger hover:bg-white/5"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
