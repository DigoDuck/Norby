import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  User,
  Lock,
  LogOut,
  Save,
  Download,
  Trash2,
  ShieldCheck,
  Palette,
  CreditCard,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/api/auth";
import { accountApi } from "@/api/account";
import { apiErrorMessage, shadcnInputCls } from "@/lib/utils";
import ThemeToggle from "@/components/shared/ThemeToggle";
import Avatar from "@/components/shared/Avatar";
import PlanCard from "@/components/shared/PlanCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Mesmo teto do backend (app/services/photo_service.py). Duplicado de
// propósito: o servidor continua sendo quem decide, isto só evita a subida
// inútil de um arquivo que já se sabe grande demais.
const MAX_FOTO_BYTES = 2 * 1024 * 1024;

// Subabas. A aba vive na URL (?aba=), então dá para linkar direto nela (o
// "Conhecer o plano Premium" abre em Plano) e o voltar do navegador funciona.
const ABAS = [
  { id: "perfil", label: "Perfil", icon: User, descricao: "Seu nome, e-mail e foto." },
  {
    id: "aparencia",
    label: "Aparência",
    icon: Palette,
    descricao: "Tema do app. Vale só neste navegador e não sincroniza entre dispositivos.",
  },
  { id: "plano", label: "Plano", icon: CreditCard, descricao: "O que o seu plano inclui e a sua assinatura." },
  { id: "seguranca", label: "Segurança", icon: Lock, descricao: "Sua senha e a sessão neste dispositivo." },
  {
    id: "privacidade",
    label: "Privacidade e dados",
    icon: ShieldCheck,
    descricao: "Seus dados são seus: baixe uma cópia quando quiser.",
  },
  {
    id: "conta",
    label: "Excluir conta",
    icon: Trash2,
    perigo: true,
    descricao: "Apaga a conta e todos os dados, sem volta.",
  },
];

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Reserva fixada no primeiro render: vindo do Checkout (?checkout=…), a aba é
  // Plano, e continua sendo depois que o PlanCard limpa esses parâmetros.
  const [abaReserva] = useState(() => (searchParams.has("checkout") ? "plano" : "perfil"));
  // useId em vez de string fixa: o componente pode aparecer mais de uma vez na
  // árvore sem duplicar id, que quebraria a associação label/campo.
  const nomeId = useId();
  const emailId = useId();
  const senhaEmailId = useId();
  const senhaEmailErrorId = useId();
  const fotoId = useId();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });
  // Issue #153: trocar o e-mail exige a senha atual (step-up), o mesmo
  // contrato do DELETE /auth/me. Nome sozinho continua sem fricção.
  // Fix round 1: comparação NORMALIZADA (o backend também compara por
  // caixa), senão só corrigir a CAIXA do próprio e-mail (Alice@x.com ->
  // alice@x.com) pedia senha à toa aqui, mesmo o servidor não indo exigi-la.
  const emailChanged =
    form.email.trim().toLowerCase() !== (user?.email || "").trim().toLowerCase();
  const [currentPassword, setCurrentPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  // Só true quando `error` é especificamente a recusa de senha do step-up
  // (#153): é o que decide se o campo de senha ganha aria-invalid/describedby,
  // e não qualquer erro de salvar (429, e-mail duplicado etc. não são sobre
  // este campo).
  const [senhaInvalida, setSenhaInvalida] = useState(false);

  const [photoError, setPhotoError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [dangerError, setDangerError] = useState(null);
  const [exportError, setExportError] = useState(null);

  async function handleLogout() {
    await authApi.logout();
    navigate("/");
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    // Zera o input: sem isso, escolher o MESMO arquivo depois de um erro não
    // dispara change de novo e a tela fica parecendo travada.
    e.target.value = "";
    if (!file) return;

    setPhotoError("");
    // O servidor recusa igual; conferir aqui só evita subir 20 MB para ouvir não.
    if (file.size > MAX_FOTO_BYTES) {
      setPhotoError("A imagem deve ter no máximo 2 MB.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const { data } = await accountApi.uploadPhoto(file);
      // Guarda só a versão: quem baixa a foto processada (128x128 WebP) é o
      // AppLayout. Mostrar o arquivo local seria mostrar um recorte diferente
      // do que ficou salvo.
      updateUser({ photo_updated_at: data.photo_updated_at });
    } catch (err) {
      setPhotoError(apiErrorMessage(err, "Não foi possível enviar a foto."));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePhotoRemove() {
    setPhotoError("");
    try {
      await accountApi.deletePhoto();
      updateUser({ photo_updated_at: null });
    } catch (err) {
      setPhotoError(apiErrorMessage(err, "Não foi possível remover a foto."));
    }
  }

  async function handleExport() {
    setExportError(null);
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
    } catch (err) {
      // O corpo do 429 do slowapi é {"error": ...}, não {"detail": ...}, então
      // apiErrorMessage cairia no fallback genérico — mapeado à mão aqui.
      setExportError(
        err.response?.status === 429
          ? "Muitas tentativas. Tente de novo mais tarde."
          : "Não foi possível exportar seus dados. Tente novamente.",
      );
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
    setSenhaInvalida(false);
    try {
      const payload = emailChanged
        ? { ...form, current_password: currentPassword }
        : form;
      const res = await authApi.updateProfile(payload);

      if (emailChanged) {
        // #156: a troca sobe o token_epoch no servidor, que mata o access
        // token desta aba na hora — a próxima chamada qualquer bateria num
        // 401 mudo. Não chama updateUser: o logout abaixo já limpa o store
        // inteiro. Mesmo padrão de RedefinirSenha.jsx -> Auth.jsx: desloga e
        // manda o state que o Auth.jsx lê para mostrar o aviso, já que esta
        // tela não fica no ar tempo nenhum para mostrar nada.
        await authApi.logout();
        navigate("/", { replace: true, state: { emailAlterado: true } });
        return;
      }

      updateUser(res.data); // só atualiza o store após sucesso no backend
      setCurrentPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (err.response?.status === 429) {
        // O corpo do 429 do slowapi é {"error": ...}, não {"detail": ...},
        // então apiErrorMessage cairia no fallback genérico.
        setError("Muitas tentativas. Tente de novo mais tarde.");
      } else if (emailChanged && err.response?.status === 401) {
        // 401 só é "senha incorreta" quando a senha era de fato exigida — o
        // mesmo status por outro motivo não pode confundir a pessoa.
        setError("Senha incorreta.");
        setSenhaInvalida(true);
      } else {
        setError(apiErrorMessage(err, "Não foi possível salvar."));
      }
    }
  }


  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : null;

  const plan = user?.plan;
  // Mesma regra do PlanCard: sem nada a dizer nem a oferecer (paywall
  // desligado), a aba Plano nem aparece.
  const temPlano = Boolean(
    plan && (plan.ai_allowed === false || plan.wallet_cap_applies === true || plan.subscription_status),
  );
  const abas = ABAS.filter((a) => a.id !== "plano" || temPlano);
  const abaUrl = searchParams.get("aba");
  const atual =
    abas.find((a) => a.id === abaUrl) ?? abas.find((a) => a.id === abaReserva) ?? abas[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-content tracking-tight">
          Configurações
        </h1>
        <p className="text-content-2 text-sm mt-1">
          Gerencie sua conta, segurança e privacidade.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav aria-label="Seções das configurações" className="lg:sticky lg:top-0 lg:w-56 lg:shrink-0">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {abas.map((a) => {
              const Icon = a.icon;
              const ativa = a.id === atual.id;
              return (
                <li key={a.id} className="shrink-0">
                  <Link
                    to={{ search: `?aba=${a.id}` }}
                    aria-current={ativa ? "page" : undefined}
                    className={`flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                      ativa
                        ? "bg-state/[0.07] text-content"
                        : a.perigo
                          ? "text-danger/90 hover:bg-danger/[0.06] hover:text-danger"
                          : "text-content-2 hover:bg-state/[0.04] hover:text-content"
                    }`}
                  >
                    <Icon
                      size={16}
                      aria-hidden="true"
                      className={ativa ? (a.perigo ? "text-danger" : "text-accent") : ""}
                    />
                    {a.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* key pela aba: a troca entra com o mesmo fade curto das páginas. */}
        <div key={atual.id} className="motion-page min-w-0 max-w-3xl flex-1 space-y-4">
          {/* O PlanCard já traz o próprio cabeçalho "Plano". */}
          {atual.id !== "plano" && (
            <div>
              <h2 className="text-lg font-semibold text-content">{atual.label}</h2>
              <p className="mt-0.5 text-sm text-content-2">{atual.descricao}</p>
            </div>
          )}

          {atual.id === "perfil" && (
            <div className="panel p-6">
            <div className="flex items-center gap-4 mb-6">
              <Avatar name={user?.name} className="w-16 h-16" fallbackClassName="text-2xl" />
              <div className="min-w-0">
                <p className="font-semibold text-content">{user?.name}</p>
                <p className="text-sm text-content-2">
                  {memberSince ? `Membro desde ${memberSince}` : user?.email}
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {/* Label + input escondido: o input de arquivo nativo não é
                      estilizável, e trocá-lo por um <button> que clica nele por JS
                      quebraria o teclado. O label já é o rótulo acessível. */}
                  <label
                    htmlFor={fotoId}
                    className="text-xs font-medium text-accent cursor-pointer hover:underline focus-within:underline"
                  >
                    {uploadingPhoto ? "Enviando…" : user?.photo_updated_at ? "Trocar foto" : "Adicionar foto"}
                    <input
                      id={fotoId}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={uploadingPhoto}
                      onChange={handlePhotoChange}
                    />
                  </label>

                  {user?.photo_updated_at && (
                    <button
                      type="button"
                      onClick={handlePhotoRemove}
                      className="text-xs font-medium text-content-2 hover:text-content transition-colors"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </div>

            {photoError && (
              <p role="alert" className="text-xs text-danger mb-4">
                {photoError}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={nomeId} className="block text-xs font-medium text-content-2 mb-2">
                  Nome completo
                </label>
                <Input
                  id={nomeId}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={shadcnInputCls}
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
                  className={shadcnInputCls}
                />
              </div>

              {/* Step-up (#153): só aparece quando o e-mail digitado difere do
                  atual, mesmo padrão visual do campo de senha da exclusão de
                  conta abaixo. */}
              {emailChanged && (
                <div className="sm:col-span-2">
                  <label htmlFor={senhaEmailId} className="block text-xs font-medium text-content-2 mb-2">
                    Senha atual (necessária para trocar o e-mail)
                  </label>
                  <Input
                    id={senhaEmailId}
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    aria-invalid={senhaInvalida ? "true" : undefined}
                    aria-describedby={senhaInvalida ? senhaEmailErrorId : undefined}
                    className={shadcnInputCls}
                  />
                </div>
              )}
            </div>

            {error && (
              <p id={senhaEmailErrorId} role="alert" className="text-danger text-xs mt-3">
                {error}
              </p>
            )}

            <Button
              onClick={handleSave}
              className="mt-5 font-medium"
            >
              <Save size={15} /> {saved ? "Salvo!" : "Salvar alterações"}
            </Button>
            </div>
          )}

          {atual.id === "aparencia" && (
            <div className="panel p-6">
              <ThemeToggle />
            </div>
          )}

          {/* Plano e assinatura (#46). */}
          {atual.id === "plano" && <PlanCard />}

          {atual.id === "seguranca" && (
            <div className="panel divide-y divide-line/[0.08] px-6">
              <div className="flex flex-col items-start justify-between gap-4 py-5 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium text-content">Senha</p>
                  <p className="text-xs text-content-2 mt-1 max-w-prose leading-relaxed">
                    Para trocá-la, use a redefinição: você recebe um link no
                    seu e-mail.
                  </p>
                </div>
                <Button variant="secondary" onClick={() => navigate("/esqueci-senha")} className="shrink-0">
                  Trocar senha
                </Button>
              </div>
              {/* Sair não é perigo: fica neutro, longe do vermelho da exclusão. */}
              <div className="flex flex-col items-start justify-between gap-4 py-5 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium text-content">Encerrar sessão</p>
                  <p className="text-xs text-content-2 mt-1">
                    Você precisará entrar novamente neste dispositivo.
                  </p>
                </div>
                <Button variant="secondary" onClick={handleLogout} className="shrink-0">
                  <LogOut size={15} /> Sair
                </Button>
              </div>
            </div>
          )}

          {atual.id === "privacidade" && (
            <div className="panel p-6">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-content">Exportar meus dados</p>
                  <p className="text-xs text-content-2 mt-1 max-w-prose leading-relaxed">
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
                <Button onClick={handleExport} disabled={exporting} variant="secondary" className="shrink-0">
                  <Download size={15} /> {exporting ? "Exportando…" : "Exportar"}
                </Button>
              </div>
              {exportError && (
                <p role="alert" className="mt-3 text-danger text-xs">
                  {exportError}
                </p>
              )}
            </div>
          )}

          {atual.id === "conta" && (
            <div className="panel border-danger/30 p-6">
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
              className={`${shadcnInputCls} mt-4`}
            />
            <Input
              type="password"
              aria-label="Sua senha atual"
              placeholder="Sua senha atual"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className={`${shadcnInputCls} mt-3`}
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
          )}
        </div>
      </div>
    </div>
  );
}
