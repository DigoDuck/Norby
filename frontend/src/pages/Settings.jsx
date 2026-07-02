import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Lock, LogOut, Save, Download, Trash2, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/api/auth";
import { accountApi } from "@/api/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Header padrão de seção: ícone em chip teal + título.
function SectionHead({ icon, children, danger }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3 mb-5">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          danger ? "bg-norby-danger/12 text-norby-danger" : "bg-norby-teal/12 text-norby-teal"
        }`}
      >
        <Icon size={16} />
      </div>
      <h2 className="font-semibold text-norby-ivory">{children}</h2>
    </div>
  );
}

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
    "bg-norby-night border-white/10 text-norby-ivory placeholder:text-norby-ivory/40";

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-norby-ivory tracking-tight">
          Configurações
        </h1>
        <p className="text-norby-ivory/50 text-sm mt-1">
          Gerencie sua conta, segurança e privacidade.
        </p>
      </div>

      {/* Perfil */}
      <div className="glass-card p-6">
        <SectionHead icon={User}>Perfil</SectionHead>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-norby-teal flex items-center justify-center text-2xl font-bold text-norby-night shrink-0">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <p className="font-semibold text-norby-ivory">{user?.name}</p>
            <p className="text-sm text-norby-ivory/50">
              {memberSince ? `Membro desde ${memberSince}` : user?.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-norby-ivory/60 mb-2">
              Nome completo
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-norby-ivory/60 mb-2">
              E-mail
            </label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>

        {error && <p className="text-norby-danger text-xs mt-3">{error}</p>}

        <Button
          onClick={handleSave}
          className="mt-5 bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium"
        >
          <Save size={15} /> {saved ? "Salvo!" : "Salvar alterações"}
        </Button>
      </div>

      {/* Segurança */}
      <div className="glass-card p-6">
        <SectionHead icon={Lock}>Segurança</SectionHead>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-norby-ivory">Senha</p>
            <p className="text-xs text-norby-ivory/45 mt-1 max-w-md leading-relaxed">
              Sua senha é armazenada com hash bcrypt. Para alterá-la, entre em
              contato com o suporte.
            </p>
          </div>
        </div>
      </div>

      {/* Privacidade e dados (LGPD) */}
      <div className="glass-card p-6">
        <SectionHead icon={ShieldCheck}>Privacidade e dados</SectionHead>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-norby-ivory">
              Exportar meus dados
            </p>
            <p className="text-xs text-norby-ivory/45 mt-1 max-w-md leading-relaxed">
              Baixe uma cópia de tudo a qualquer momento. Veja como tratamos
              suas informações na{" "}
              <Link to="/privacidade" className="text-norby-teal hover:underline">
                Política de Privacidade
              </Link>{" "}
              e nos{" "}
              <Link to="/termos" className="text-norby-teal hover:underline">
                Termos de Uso
              </Link>
              .
            </p>
          </div>
          <Button
            onClick={handleExport}
            disabled={exporting}
            variant="outline"
            className="shrink-0 border-norby-teal/40 bg-transparent text-norby-teal hover:bg-norby-teal/10"
          >
            <Download size={15} /> {exporting ? "Exportando…" : "Exportar"}
          </Button>
        </div>
      </div>

      {/* Zona de perigo: exclusão definitiva (LGPD) */}
      <div className="glass-card border-norby-danger/30 p-6">
        <SectionHead icon={Trash2} danger>
          Excluir minha conta
        </SectionHead>
        <p className="text-sm text-norby-ivory/60 leading-relaxed">
          Esta ação é <strong>permanente</strong>. Todos os seus dados serão
          apagados de verdade dos nossos bancos (incluindo histórico da IA) e não
          poderão ser recuperados. Para confirmar, digite{" "}
          <strong className="text-norby-ivory">EXCLUIR</strong> abaixo.
        </p>
        <Input
          placeholder="Digite EXCLUIR para confirmar"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className={`${inputCls} mt-4`}
        />
        {dangerError && <p className="text-norby-danger text-xs mt-2">{dangerError}</p>}
        <Button
          onClick={handleDeleteAccount}
          disabled={confirmText !== "EXCLUIR" || deleting}
          className="mt-4 bg-norby-danger hover:bg-norby-danger/80 text-norby-ivory disabled:opacity-40"
        >
          <Trash2 size={15} />
          {deleting ? "Excluindo…" : "Excluir minha conta permanentemente"}
        </Button>
      </div>

      {/* Encerrar sessão */}
      <div className="glass-card border-norby-danger/25 p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-norby-ivory">
            Encerrar sessão
          </p>
          <p className="text-xs text-norby-ivory/45 mt-1">
            Você precisará entrar novamente neste dispositivo.
          </p>
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="shrink-0 border-norby-danger/40 bg-norby-danger/10 text-norby-danger hover:bg-norby-danger hover:text-norby-ivory"
        >
          <LogOut size={15} /> Sair
        </Button>
      </div>
    </div>
  );
}
