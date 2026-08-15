import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User,
  Lock,
  LogOut,
  Save,
  Download,
  Trash2,
  ShieldCheck,
  Palette,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/api/auth";
import { accountApi } from "@/api/account";
import { apiErrorMessage } from "@/lib/utils";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Header padrão de seção: ícone semântico + título.
function SectionHead({ icon, children, danger }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3 mb-5">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          danger
            ? "bg-danger/[0.12] text-danger"
            : "bg-accent/[0.12] text-accent"
        }`}
      >
        <Icon size={16} />
      </div>
      <h2 className="font-semibold text-content">{children}</h2>
    </div>
  );
}

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const navigate = useNavigate();
  // useId em vez de string fixa: o componente pode aparecer mais de uma vez na
  // árvore sem duplicar id, que quebraria a associação label/campo.
  const nomeId = useId();
  const emailId = useId();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
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
      await accountApi.deleteAccount(deletePassword);
      // Conta apagada no servidor (PG + Mongo); limpa o estado local e sai.
      useAuthStore.getState().logout();
      navigate("/");
    } catch (err) {
      setDangerError(
        err.response?.status === 401
          ? "Senha incorreta."
          : "Não foi possível excluir a conta. Tente novamente.",
      );
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
      setError(apiErrorMessage(err, "Não foi possível salvar."));
    }
  }

  const inputCls =
    "bg-surface-inset border-line/10 text-content placeholder:text-content-3";

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-content tracking-tight">
          Configurações
        </h1>
        <p className="text-content-2 text-sm mt-1">
          Gerencie sua conta, segurança e privacidade.
        </p>
      </div>

      {/* Aparência */}
      <div className="glass p-6">
        <SectionHead icon={Palette}>Aparência</SectionHead>
        <p className="text-sm text-content-2 mb-4 leading-relaxed">
          A escolha vale só neste navegador e não sincroniza entre dispositivos.
        </p>
        <ThemeToggle />
      </div>

      {/* Perfil */}
      <div className="glass p-6">
        <SectionHead icon={User}>Perfil</SectionHead>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-accent-fill flex items-center justify-center text-2xl font-bold text-accent-contrast shrink-0">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <p className="font-semibold text-content">{user?.name}</p>
            <p className="text-sm text-content-2">
              {memberSince ? `Membro desde ${memberSince}` : user?.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={nomeId} className="block text-xs font-medium text-content-2 mb-2">
              Nome completo
            </label>
            <Input
              id={nomeId}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor={emailId} className="block text-xs font-medium text-content-2 mb-2">
              E-mail
            </label>
            <Input
              id={emailId}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>

        {error && <p className="text-danger text-xs mt-3">{error}</p>}

        <Button
          onClick={handleSave}
          className="mt-5 bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
        >
          <Save size={15} /> {saved ? "Salvo!" : "Salvar alterações"}
        </Button>
      </div>

      {/* Segurança */}
      <div className="glass p-6">
        <SectionHead icon={Lock}>Segurança</SectionHead>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-content">Senha</p>
            <p className="text-xs text-content-2 mt-1 max-w-md leading-relaxed">
              Sua senha é armazenada com hash bcrypt. Para alterá-la, entre em
              contato com o suporte.
            </p>
          </div>
        </div>
      </div>

      {/* Privacidade e dados (LGPD) */}
      <div className="glass p-6">
        <SectionHead icon={ShieldCheck}>Privacidade e dados</SectionHead>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-content">
              Exportar meus dados
            </p>
            <p className="text-xs text-content-2 mt-1 max-w-md leading-relaxed">
              Baixe uma cópia de tudo a qualquer momento. Veja como tratamos
              suas informações na{" "}
              <Link to="/privacidade" className="text-accent hover:underline">
                Política de Privacidade
              </Link>{" "}
              e nos{" "}
              <Link to="/termos" className="text-accent hover:underline">
                Termos de Uso
              </Link>
              .
            </p>
          </div>
          <Button
            onClick={handleExport}
            disabled={exporting}
            variant="outline"
            className="shrink-0 border-accent/40 bg-transparent text-accent hover:bg-accent/10"
          >
            <Download size={15} /> {exporting ? "Exportando…" : "Exportar"}
          </Button>
        </div>
      </div>

      {/* Zona de perigo: exclusão definitiva (LGPD) */}
      <div className="glass border-danger/30 p-6">
        <SectionHead icon={Trash2} danger>
          Excluir minha conta
        </SectionHead>
        <p className="text-sm text-content-2 leading-relaxed">
          Esta ação é <strong>permanente</strong>. Todos os seus dados serão
          apagados de verdade dos nossos bancos (incluindo histórico da IA) e não
          poderão ser recuperados. Para confirmar, digite{" "}
          <strong className="text-content">EXCLUIR</strong> e a sua senha.
        </p>
        <Input
          aria-label="Digite EXCLUIR para confirmar"
          placeholder="Digite EXCLUIR para confirmar"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className={`${inputCls} mt-4`}
        />
        <Input
          type="password"
          aria-label="Sua senha atual"
          placeholder="Sua senha atual"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          className={`${inputCls} mt-3`}
        />
        {dangerError && <p className="text-danger text-xs mt-2">{dangerError}</p>}
        <Button
          onClick={handleDeleteAccount}
          disabled={confirmText !== "EXCLUIR" || !deletePassword || deleting}
          className="mt-4 bg-danger text-bg-base hover:bg-danger/80 disabled:opacity-40"
        >
          <Trash2 size={15} />
          {deleting ? "Excluindo…" : "Excluir minha conta permanentemente"}
        </Button>
      </div>

      {/* Encerrar sessão */}
      <div className="glass border-danger/25 p-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-content">
            Encerrar sessão
          </p>
          <p className="text-xs text-content-2 mt-1">
            Você precisará entrar novamente neste dispositivo.
          </p>
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="shrink-0 border-danger/40 bg-danger/10 text-danger hover:bg-danger hover:text-bg-base"
        >
          <LogOut size={15} /> Sair
        </Button>
      </div>
    </div>
  );
}
