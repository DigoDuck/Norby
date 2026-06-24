import { useEffect, useState } from "react";
import { Plus, Trash2, Target, PiggyBank } from "lucide-react";
import { goalsApi } from "@/api/goals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const inputCls =
  "bg-white/5 border-white/10 text-norby-ivory placeholder:text-norby-ivory/30";
const emptyForm = {
  name: "", type: "SAVINGS", target_amount: "", current_amount: "", category: "",
};
const fmt = (v) =>
  `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setGoals((await goalsApi.list()).data);
  }
  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    if (!form.name.trim()) return setError("Informe o nome.");
    if (!form.target_amount || Number(form.target_amount) <= 0)
      return setError("O alvo deve ser maior que zero.");
    if (form.type === "BUDGET" && !form.category.trim())
      return setError("Categoria é obrigatória para orçamento.");
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      type: form.type,
      target_amount: form.target_amount,
      ...(form.type === "SAVINGS"
        ? { current_amount: form.current_amount === "" ? "0" : form.current_amount }
        : { category: form.category }),
    };
    try {
      await goalsApi.create(payload);
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Não foi possível salvar a meta.");
    } finally {
      setSaving(false);
    }
  }

  async function handleContribute(goal) {
    const raw = prompt(`Adicionar aporte em "${goal.name}" (use negativo para corrigir):`);
    if (raw === null) return;
    const amount = Number(raw);
    if (!amount) return;
    try {
      await goalsApi.contribute(goal.id, amount);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Não foi possível salvar o aporte.");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remover esta meta?")) return;
    try {
      await goalsApi.delete(id);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Não foi possível remover a meta.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-norby-ivory tracking-tight">Metas</h1>
          <p className="text-norby-ivory/50 text-sm mt-1">
            Objetivos de poupança e orçamentos mensais
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
            <Plus size={16} className="mr-1" /> Nova Meta
          </DialogTrigger>
          <DialogContent className="bg-norby-surface border-white/10 text-norby-ivory">
            <DialogHeader>
              <DialogTitle>Nova meta</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={`w-full rounded-md px-3 py-2 ${inputCls}`}
              >
                <option value="SAVINGS">Poupança (acumular)</option>
                <option value="BUDGET">Orçamento (teto mensal)</option>
              </select>
              <Input
                placeholder="Nome" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
              <Input
                type="number"
                placeholder={form.type === "SAVINGS" ? "Valor-alvo" : "Teto mensal"}
                value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                className={inputCls}
              />
              {form.type === "SAVINGS" ? (
                <Input
                  type="number" placeholder="Já guardado (opcional)"
                  value={form.current_amount}
                  onChange={(e) => setForm({ ...form, current_amount: e.target.value })}
                  className={inputCls}
                />
              ) : (
                <Input
                  placeholder="Categoria (ex: Alimentação)" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className={inputCls}
                />
              )}
              {error && <p className="text-norby-danger text-xs">{error}</p>}
              <Button
                onClick={handleSave} disabled={saving}
                className="w-full bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
              >
                {saving ? "Salvando…" : "Criar meta"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {goals.length === 0 && (
          <p className="col-span-2 text-norby-ivory/40 text-sm">Nenhuma meta ainda.</p>
        )}
        {goals.map((g) => {
          const pct = Math.min(g.progress_pct, 100);
          const over = g.type === "BUDGET" && g.progress_pct >= 100;
          const near = g.type === "BUDGET" && g.progress_pct >= 80 && !over;
          const barColor = over
            ? "bg-norby-danger"
            : near
              ? "bg-[#E0B341]"
              : "bg-norby-teal";
          const Icon = g.type === "SAVINGS" ? PiggyBank : Target;
          return (
            <div key={g.id} className="glass-card-hover p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-norby-teal/15 flex items-center justify-center">
                    <Icon size={18} className="text-norby-teal" />
                  </div>
                  <div>
                    <p className="text-norby-ivory font-medium">{g.name}</p>
                    <p className="text-xs text-norby-ivory/40">
                      {g.type === "SAVINGS" ? "Poupança" : `Orçamento · ${g.category}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {g.type === "SAVINGS" && (
                    <button
                      onClick={() => handleContribute(g)}
                      className="p-2 rounded-lg text-norby-ivory/40 hover:text-norby-teal hover:bg-white/5"
                      title="Adicionar aporte"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(g.id)}
                    className="p-2 rounded-lg text-norby-ivory/40 hover:text-norby-danger hover:bg-white/5"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-norby-ivory/60 tnum">
                  {fmt(g.current_amount)} / {fmt(g.target_amount)}
                </span>
                <span className={over ? "text-norby-danger" : "text-norby-ivory/40"}>
                  {g.progress_pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
