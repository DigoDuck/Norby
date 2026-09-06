import { useEffect, useMemo, useState } from "react";
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

// Card de métrica: rótulo em microlabel + número em destaque.
function MetricCard({ label, value, danger }) {
  return (
    <div className="glass p-5">
      <p className="microlabel">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tnum tracking-tight ${
          danger ? "text-danger" : "text-content"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Faixa de acesso do usuário, derivada com o MESMO critério do backend
 * (admin_service.metricas): premium quando `premium_until` está no futuro;
 * trial quando `ai_trial_ends_at` está no futuro e não há premium ativo;
 * vencido quando `premium_until` existe mas já passou; o resto é free.
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
    <li
      data-user-row
      className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-medium text-content truncate">{user.name}</p>
        <p className="text-sm text-content-2 truncate">{user.email}</p>
        <p className="text-xs text-content-3 mt-1">
          {faixaUsuario(user)}
          {user.subscription_status ? ` · ${user.subscription_status}` : ""}
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
                className="text-danger border-danger/40 hover:bg-danger/10"
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
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [metricsRes, usersRes] = await Promise.all([
        adminApi.metrics(),
        adminApi.users(),
      ]);
      setMetrics(metricsRes.data);
      setUsers(usersRes.data);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível carregar os dados de admin."));
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

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      </div>
    );
  }

  const iaProporcao =
    metrics.ai_calls_project_limit > 0
      ? metrics.ai_calls_today / metrics.ai_calls_project_limit
      : 0;

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
          danger={iaProporcao >= 0.8}
        />
      </div>

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
