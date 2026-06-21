import { useEffect, useState } from "react";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { transactionsApi } from "@/api/transactions";
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
import { Badge } from "@/components/ui/badge";

const CATEGORIES = [
  "Alimentação",
  "Educação",
  "Moradia",
  "Transporte",
  "Saúde",
  "Lazer",
  "Outros",
];

const emptyForm = () => ({
  wallet_id: "",
  type: "EXPENSE",
  amount: "",
  category: CATEGORIES[0],
  description: "",
  date: new Date().toISOString().split("T")[0],
});

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [form, setForm] = useState(emptyForm);

  async function load(params = {}) {
    const res = await transactionsApi.list(params);
    setTransactions(res.data);
  }

  useEffect(() => {
    walletsApi.list().then((r) => setWallets(r.data));
    load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => load(filterType ? { type: filterType } : {}),
      400,
    );
    return () => clearTimeout(timer);
  }, [filterType]);

  const reload = () => load(filterType ? { type: filterType } : {});

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(t) {
    setEditing(t);
    setForm({
      wallet_id: t.wallet_id,
      type: t.type,
      amount: String(t.amount),
      category: t.category,
      description: t.description || "",
      date: new Date(t.date).toISOString().split("T")[0],
    });
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    if (!form.wallet_id) return setError("Selecione uma carteira.");
    if (!form.amount || parseFloat(form.amount) <= 0)
      return setError("Informe um valor maior que zero.");

    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editing) {
        await transactionsApi.update(editing.id, payload);
      } else {
        await transactionsApi.create(payload);
      }
      setOpen(false);
      setEditing(null);
      setForm(emptyForm());
      reload();
    } catch (err) {
      setError(
        err.response?.data?.detail || "Não foi possível salvar a transação.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Remover esta transação?")) return;
    try {
      await transactionsApi.delete(id);
      reload();
    } catch (err) {
      alert(
        err.response?.data?.detail || "Não foi possível remover a transação.",
      );
    }
  }

  const fmt = (v) =>
    `R$ ${parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const filtered = transactions.filter(
    (t) =>
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black">Relatórios</h1>
          <p className="text-black/80 text-sm mt-1">
            Histórico completo de transações
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
          <DialogTrigger asChild>
            <Button
              onClick={openNew}
              className="bg-violet-600 hover:bg-violet-500 text-white mt-1"
            >
              <Plus size={16} className="mr-1" /> Nova Transação
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-black/10 text-black">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar Transação" : "Nova Transação"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                {["INCOME", "EXPENSE"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    className={`py-2 rounded-lg text-sm font-medium transition-all ${
                      form.type === t
                        ? t === "INCOME"
                          ? "bg-emerald-600 text-white"
                          : "bg-red-600 text-white"
                        : "bg-black/5 text-black/80"
                    }`}
                  >
                    {t === "INCOME" ? "Receita" : "Despesa"}
                  </button>
                ))}
              </div>
              <select
                value={form.wallet_id}
                onChange={(e) =>
                  setForm({ ...form, wallet_id: e.target.value })
                }
                className="w-full p-2 rounded-lg bg-black/5 border border-white/20 text-black text-sm"
              >
                <option value="">Selecionar carteira</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                placeholder="Valor"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="bg-black/5 border-white/20 text-black placeholder:text-black/80 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full p-2 rounded-lg bg-black/5 border border-white/20 text-black text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Descrição(opcional)"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="bg-black/5 border-white/20 text-black placeholder:text-black/80"
              />
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="bg-black/5 border-white/20 text-black"
              />
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
                    : "Registrar Transação"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {/*Filtros*/}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-2 text-black/30"
          />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-black placeholder:text-black/30"
          />
        </div>
        {["", "INCOME", "EXPENSE"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              filterType === t
                ? "bg-violet-600 text-white"
                : "glass-card text-black/50 hover:text-black"
            }`}
          >
            {t === "" ? "Todos" : t === "INCOME" ? "Receitas" : "Despesas"}
          </button>
        ))}
      </div>
      {/*Tabela*/}
      <div className="glass-card overflow-hidden">
        <table className="w-full">
            <thead>
                <tr className="border-b border-white/20">
                {["Categoria", "Descrição", "Tipo", "Valor", "Data", ""].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-black/60 uppercase tracking-wider px-4 py-3">
                        {h}
                    </th>
                ))}
                </tr>
            </thead>
            <tbody>
                {filtered.map((t) => (
                    <tr key={t.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-black/80">{t.category}</td>
                        <td className="px-4 py-3 text-sm text-black/80">{t.description || "-"}</td>
                        <td>
                            <Badge className={ t.type === "INCOME" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20 rounded-lg" : "bg-red-500/15 text-red-400 border-red-500/20 rounded-lg"}>
                                {t.type === "INCOME" ? "Receita" : "Despesa"}
                            </Badge>
                        </td>
                        <td className={`px-4 py-4 text-sm font-semibold ${t.type === "INCOME" ? "text-emerald-400" : "text-red-600"}`}>
                            {t.type === "INCOME" ? "+" : "-"}{fmt(t.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-black/80">
                            {new Date(t.date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                            <div className="flex gap-2">
                                <button onClick={() => openEdit(t)} className="text-black/60 hover:text-black transition-colors">
                                    <Pencil size={16}/>
                                </button>
                                <button onClick={() => handleDelete(t.id)} className="text-black/80 hover:text-red-400 transition-colors">
                                    <Trash2 size={16}/>
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {filtered.length === 0 && (
            <div className="text-center py-12 text-black">Nenhuma Transação encontrada.</div>
        )}
      </div>
    </div>
  );
}
