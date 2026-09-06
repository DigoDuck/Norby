import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { adminApi } from "@/api/admin";
import { useAuthStore } from "@/store/authStore";
import { apiErrorMessage, formatBRL, formatDateBR, shadcnInputCls } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Mesma lista do backend (app/services/billing_service.py STATUS_TERMINAIS):
// nestes estados não há mais nada a cancelar no Stripe.
const STATUS_TERMINAIS = new Set(["canceled", "incomplete_expired"]);

// Card de métrica: rótulo em microlabel + número em destaque. `tone` sinaliza
// o valor sem trocar o layout: "warning" perto do limite, "danger" no limite.
function MetricCard({ label, value, tone }) {
  const toneClass =
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-content";
  return (
    <div className="glass p-5">
      <p className="microlabel">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tnum tracking-tight ${toneClass}`}>{value}</p>
    </div>
  );
}

/**
 * Faixa de acesso do usuário para a LINHA da lista. Usa os mesmos campos que
 * `admin_service.metricas` (premium_until/ai_trial_ends_at), mas não é o
 * mesmo cálculo: as métricas contam cada balde (premium/trial/vencido)
 * separadamente e eles podem se sobrepor no dado bruto, enquanto aqui, por
 * linha, o trial só aparece quando não há premium ativo — premium sempre
 * ganha da exibição de trial.
 */
function faixaUsuario(user) {
  const agora = new Date();
  const premiumUntil = user.premium_until ? new Date(user.premium_until) : null;
  const trialEnds = user.ai_trial_ends_at ? new Date(user.ai_trial_ends_at) : null;
  if (premiumUntil && premiumUntil > agora) return `Premium até ${formatDateBR(user.premium_until)}`;
  if (trialEnds && trialEnds > agora) return `Trial até ${formatDateBR(user.ai_trial_ends_at)}`;
  if (premiumUntil) return "Vencido";
  return "Free";
}

function AdminUserRow({ user, isSelf, onChanged }) {
  const podeCancelar =
    Boolean(user.subscription_status) && !STATUS_TERMINAIS.has(user.subscription_status);

  return (
    <li className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-content truncate">{user.name}</p>
          {user.is_admin && <span className="microlabel text-accent shrink-0">Admin</span>}
        </div>
        <p className="text-sm text-content-2 truncate">{user.email}</p>
        <p className="text-xs text-content-3 mt-1">
          {faixaUsuario(user)}
          {user.subscription_status ? ` · ${user.subscription_status}` : ""}
          {user.cancel_at_period_end ? " · cancela no fim do período" : ""}
        </p>
      </div>

      {!isSelf && (
        <div className="flex flex-wrap gap-2 shrink-0">
          {podeCancelar && (
            <ConfirmDialog
              requirePassword
              trigger={
                <Button variant="outline" size="sm">
                  Cancelar assinatura
                </Button>
              }
              title={`Cancelar a assinatura de ${user.name}?`}
              description="A assinatura é cancelada imediatamente no Stripe, sem esperar o fim do período."
              errorFallback="Não foi possível cancelar a assinatura."
              onConfirm={(password) =>
                adminApi.cancelSubscription(user.id, password).then(onChanged)
              }
            />
          )}
          <ConfirmDialog
            requirePassword
            trigger={
              <Button variant="outline" size="sm">
                Enviar recuperação de senha
              </Button>
            }
            title={`Enviar recuperação de senha para ${user.name}?`}
            description="Um e-mail com o link de redefinição de senha será enviado para esta conta."
            errorFallback="Não foi possível enviar o e-mail de recuperação."
            onConfirm={(password) =>
              adminApi.sendRecoveryEmail(user.id, password).then(onChanged)
            }
          />
          <ConfirmDialog
            requirePassword
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="text-danger border-danger/40 hover:bg-danger/10 hover:text-danger"
              >
                Excluir conta
              </Button>
            }
            title={`Excluir a conta de ${user.name}?`}
            description="Esta ação é permanente: os dados desta pessoa são apagados dos nossos bancos."
            errorFallback="Não foi possível excluir a conta."
            onConfirm={(password) => adminApi.deleteUser(user.id, password).then(onChanged)}
          />
        </div>
      )}
    </li>
  );
}

export default function Admin() {
  const currentUser = useAuthStore((s) => s.user);
  const [metrics, setMetrics] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  // Dois erros, não um: `loadError` só existe enquanto a tela nunca mostrou
  // dado nenhum (substitui a página, com botão de tentar de novo). Depois da
  // primeira carga bem-sucedida, uma releitura que falhar (chamada de novo
  // pelas ações da linha via `onChanged`) vira `refreshError` — a lista e as
  // métricas continuam montadas (ainda são dados válidos), só um aviso
  // inline aparece. Sem essa separação, uma falha transitória de releitura
  // depois de uma exclusão bem-sucedida apagava a tela inteira e trocava o
  // <h1> por uma frase vermelha, na única tela cujo trabalho é ação
  // destrutiva de operador.
  const [loadError, setLoadError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  // Ref, não estado: só decide qual mensagem de erro usar, nunca é lida no
  // JSX, e um ref evita fechar `load` sobre um `metrics` desatualizado (o que
  // obrigaria a listar `metrics` nas deps do useEffect de mount só por causa
  // deste `if`).
  const hasLoadedRef = useRef(false);

  async function load() {
    try {
      const [metricsRes, usersRes] = await Promise.all([
        adminApi.metrics(),
        adminApi.users(),
      ]);
      setMetrics(metricsRes.data);
      setUsers(usersRes.data);
      setLoadError(null);
      setRefreshError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      const message = apiErrorMessage(err, "Não foi possível carregar os dados de admin.");
      if (hasLoadedRef.current) {
        setRefreshError(
          "Não foi possível atualizar os dados agora. Os números podem estar desatualizados.",
        );
      } else {
        setLoadError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Busca dados no mount, padrão do resto do app (ver Wallets.jsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filteredUsers = useMemo(() => {
    const termo = query.trim().toLowerCase();
    if (!termo) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo),
    );
  }, [users, query]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="h-9 w-32 rounded-lg bg-line/10 animate-pulse" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass p-5 h-[72px] animate-pulse" />
          ))}
        </div>
        <div className="glass p-6 h-48 animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <p role="alert" className="text-danger text-sm">
          {loadError}
        </p>
        <Button variant="outline" onClick={load}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const iaProporcao =
    metrics.ai_calls_project_limit > 0
      ? metrics.ai_calls_today / metrics.ai_calls_project_limit
      : 0;
  const iaTone = iaProporcao >= 1 ? "danger" : iaProporcao >= 0.8 ? "warning" : undefined;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-content tracking-tight">Admin</h1>
        <p className="text-content-2 text-sm mt-1">
          Métricas e ações sobre contas. Tudo fica registrado.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Usuários" value={metrics.users} />
        <MetricCard label="Premium ativos" value={metrics.premium} />
        <MetricCard label="Em trial" value={metrics.trial} />
        <MetricCard label="Vencidos" value={metrics.expired} />
        <MetricCard label="MRR" value={formatBRL(metrics.mrr_brl)} />
        <MetricCard
          label="IA hoje"
          value={`${metrics.ai_calls_today} / ${metrics.ai_calls_project_limit}`}
          tone={iaTone}
        />
      </div>

      {refreshError && (
        <p role="alert" className="text-warning text-xs">
          {refreshError}
        </p>
      )}

      <div className="glass p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/[0.12] text-accent">
            <Search size={16} />
          </div>
          <h2 className="font-semibold text-content">Usuários</h2>
        </div>

        <Input
          aria-label="Buscar usuário"
          placeholder="Buscar por nome ou e-mail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${shadcnInputCls} mb-4`}
        />

        {filteredUsers.length === 0 ? (
          <p className="text-content-3 text-sm text-center py-6">
            Nenhum usuário com esse nome ou e-mail
          </p>
        ) : (
          <ul className="divide-y divide-line/[0.08]">
            {filteredUsers.map((u) => (
              <AdminUserRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUser?.id}
                onChanged={load}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
