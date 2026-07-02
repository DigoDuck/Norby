import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Lock, LogOut, Save, Download, Trash2, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/api/auth";
import { accountApi } from "@/api/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Settings() {
  const { user, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [dangerError, setDangerError] = useState(null);

  async function handleLogout() {
    await authApi.logout();
    navigate("/");
  }

  async function handleExport() {
    setDangerError(null);
    setExporting(true);
    try {
      const res = await accountApi.exportData();
      // Dispara o download do JSON no navegador.
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "norby-meus-dados.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDangerError("Não foi possível exportar seus dados. Tente novamente.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDangerError(null);
    setDeleting(true);
    try {
      await accountApi.deleteAccount();
      // Conta apagada no servidor (PG + Mongo); limpa o estado local e sai.
      useAuthStore.getState().logout();
      navigate("/");
    } catch {
      setDangerError("Não foi possível excluir a conta. Tente novamente.");
      setDeleting(false);
    }
  }

  async function handleSave() {
    setError(null);
    try {
      const res = await authApi.updateProfile(form);
      updateUser(res.data); // só atualiza o store após sucesso no backend
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Não foi possível salvar.");
    }
  }

  const inputCls =
    "bg-white/5 border-white/10 text-norby-ivory placeholder:text-norby-ivory/40";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-norby-ivory tracking-tight">
          Configurações
        </h1>
        <p className="text-norby-ivory/50 text-sm mt-1">Gerencie seu perfil</p>
      </div>

      {/* Perfil */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <User size={20} className="text-norby-teal" />
          <h2 className="font-semibold text-norby-ivory">Perfil</h2>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-3xl bg-norby-teal flex items-center justify-center text-2xl font-bold text-norby-night">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-norby-ivory">{user?.name}</p>
            <p className="text-sm text-norby-ivory/50">{user?.email}</p>
          </div>
        </div>
        <Input
          placeholder="Nome"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputCls}
        />
        <Input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={inputCls}
        />
        {error && <p className="text-norby-danger text-xs">{error}</p>}
        <Button
          onClick={handleSave}
          className="bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
        >
          <Save size={15} className="mr-1.5" />
          {saved ? "Salvo!" : "Salvar alterações"}
        </Button>
      </div>

      {/* Segurança */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Lock size={18} className="text-norby-teal" />
          <h2 className="font-semibold text-norby-ivory">Segurança</h2>
        </div>
        <p className="text-sm text-norby-ivory/60">
          Sua senha é armazenada com hash bcrypt. Para alterar, entre em contato
          com o suporte.
        </p>
      </div>

      {/* Privacidade e dados (LGPD) */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck size={18} className="text-norby-teal" />
          <h2 className="font-semibold text-norby-ivory">Privacidade e dados</h2>
        </div>
        <p className="text-sm text-norby-ivory/60">
          Você pode baixar uma cópia de todos os seus dados a qualquer momento.
          Veja como tratamos suas informações na{" "}
          <Link to="/privacidade" className="text-norby-teal hover:underline">
            Política de Privacidade
          </Link>{" "}
          e nos{" "}
          <Link to="/termos" className="text-norby-teal hover:underline">
            Termos de Uso
          </Link>
          .
        </p>
        <Button
          onClick={handleExport}
          disabled={exporting}
          variant="outline"
          className="border-norby-teal/40 text-norby-teal hover:bg-norby-teal hover:text-norby-night"
        >
          <Download size={15} className="mr-1.5" />
          {exporting ? "Exportando..." : "Exportar meus dados"}
        </Button>
      </div>

      {/* Zona de perigo: exclusão definitiva (LGPD) */}
      <div className="glass-card p-6 space-y-4 border border-norby-danger/30">
        <div className="flex items-center gap-3">
          <Trash2 size={18} className="text-norby-danger" />
          <h2 className="font-semibold text-norby-ivory">Excluir minha conta</h2>
        </div>
        <p className="text-sm text-norby-ivory/60">
          Esta ação é <strong>permanente</strong>. Todos os seus dados serão
          apagados de verdade dos nossos bancos (incluindo histórico da IA) e não
          poderão ser recuperados. Para confirmar, digite{" "}
          <strong className="text-norby-ivory">EXCLUIR</strong> abaixo.
        </p>
        <Input
          placeholder="Digite EXCLUIR para confirmar"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className={inputCls}
        />
        {dangerError && <p className="text-norby-danger text-xs">{dangerError}</p>}
        <Button
          onClick={handleDeleteAccount}
          disabled={confirmText !== "EXCLUIR" || deleting}
          className="bg-norby-danger hover:bg-norby-danger/80 text-norby-ivory disabled:opacity-40"
        >
          <Trash2 size={15} className="mr-1.5" />
          {deleting ? "Excluindo..." : "Excluir minha conta permanentemente"}
        </Button>
      </div>

      {/* Logout */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-norby-ivory">Sair da Conta</h2>
          <p className="text-sm text-norby-ivory/50 mt-1">
            Você será redirecionado para o login
          </p>
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="border-norby-danger/40 text-norby-danger hover:bg-norby-danger hover:text-norby-ivory mt-4"
        >
          <LogOut size={15} className="mr-1.5" /> Sair
        </Button>
      </div>
    </div>
  );
}
