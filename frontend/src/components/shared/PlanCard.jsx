import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CreditCard } from "lucide-react";

import { billingApi } from "@/api/billing";
import { authApi } from "@/api/auth";
import { aiApi } from "@/api/ai";
import { useAuthStore } from "@/store/authStore";
import { apiErrorMessage, formatDateBR } from "@/lib/utils";
import { PRECO_MENSAL } from "@/lib/plano";
import { Button } from "@/components/ui/button";

/**
 * Formata `resets_at` (ISO, UTC) no fuso do navegador — a pessoa quer saber
 * quando a cota libera NA HORA DELA, não em UTC-8 (o dia da cota do backend).
 */
function formatResetsAt(resetsAt) {
  return new Date(resetsAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Estado do plano e as duas portas de saída para o Stripe (issue #46).
 *
 * A CTA de assinar aparece SÓ quando o paywall está de fato restringindo esta
 * pessoa, e isso não é detalhe: com o flag desligado os dois booleanos do
 * `plan` reportam liberado (ADR 0002), então nada é oferecido. É o
 * comportamento certo — enquanto o paywall está apagado o premium não entrega
 * nada a mais, e vender isso seria cobrar por ar. Quando o flag acender, a CTA
 * aparece sozinha, exatamente para quem está sendo limitado.
 *
 * Repare que isto NÃO lê o flag: os booleanos já dizem "o paywall está fazendo
 * algo com você", que é a pergunta real. Expor `paywall_enabled` ao frontend
 * quebraria a regra do ADR de ele ser lido só nos dois helpers de enforcement.
 */
export default function PlanCard() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const [carregando, setCarregando] = useState("");
  const [erro, setErro] = useState("");
  const [uso, setUso] = useState(null);

  // A VOLTA do Checkout. O Stripe devolve a pessoa para cá com o id da sessão
  // na URL, e o webhook pode ainda não ter chegado — sem isto ela volta de uma
  // compra bem-sucedida e lê que não é premium.
  //
  // O id sai da URL depois, o que também evita reprocessar num F5.
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;

    let vivo = true;
    billingApi
      .confirmCheckout(sessionId)
      .then(() => authApi.me())
      .then(({ data }) => {
        if (vivo) updateUser(data);
      })
      // Silencioso: o webhook chega em segundos e conserta sozinho. Assustar
      // quem acabou de pagar com um erro que se resolve sozinho é pior do que
      // deixar a tela atualizar um instante depois.
      .catch(() => {})
      .finally(() => {
        if (!vivo) return;
        const limpo = new URLSearchParams(searchParams);
        limpo.delete("session_id");
        limpo.delete("checkout");
        setSearchParams(limpo, { replace: true });
      });

    return () => {
      vivo = false;
    };
  }, [searchParams, setSearchParams, updateUser]);

  const plan = user?.plan;
  const restringido =
    plan?.ai_allowed === false || plan?.wallet_cap_applies === true;
  const temAssinatura = Boolean(plan?.subscription_status);
  const premiumAtivo = Boolean(
    plan?.premium_until && new Date(plan.premium_until) > new Date(),
  );

  // Uso do dia para o medidor (#25). Só busca com acesso à IA — sem ele o
  // cartão já não teria nada pra mostrar aqui. Falha de rede não vira erro na
  // tela do plano: o medidor é informativo, então some em silêncio.
  useEffect(() => {
    if (!plan?.ai_allowed) return;
    let vivo = true;
    aiApi
      .getUsage()
      .then(({ data }) => {
        if (vivo) setUso(data);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [plan?.ai_allowed]);

  async function abrir(qual) {
    setErro("");
    setCarregando(qual);
    try {
      const { data } =
        qual === "checkout"
          ? await billingApi.checkoutSession()
          : await billingApi.portalSession();
      // Checkout e Portal são HOSPEDADOS: a pessoa sai do app de propósito,
      // para a CSP não precisar abrir para js.stripe.com (ADR 0001).
      window.location.assign(data.url);
    } catch (err) {
      setErro(apiErrorMessage(err, "Não foi possível abrir agora. Tente de novo."));
      setCarregando("");
    }
  }

  function descricao() {
    if (plan?.subscription_status === "past_due") {
      return "Pagamento recusado. Atualize o cartão para não perder o acesso.";
    }
    if (premiumAtivo) {
      const data = formatDateBR(plan.premium_until);
      // "Renova" e "termina" não são a mesma frase, e a diferença mora só no
      // `cancel_at_period_end`: sem ele a tela diria "renova" para quem já
      // cancelou.
      return plan.cancel_at_period_end
        ? `Sua assinatura termina em ${data}.`
        : `Sua assinatura renova em ${data}.`;
    }
    if (plan?.ai_trial_ends_at && new Date(plan.ai_trial_ends_at) > new Date()) {
      return `Você está no teste da IA até ${formatDateBR(plan.ai_trial_ends_at)}.`;
    }
    return "Você está no plano gratuito.";
  }

  // Sem nada a dizer nem a oferecer, o cartão não aparece: um bloco "plano
  // gratuito" sem ação vira ruído na tela de quem não pode fazer nada com ele.
  if (!plan || (!restringido && !temAssinatura)) return null;

  // A barra é movida pelo teto mais próximo de estourar (tokens ou chamadas),
  // não pela média dos dois: são limites independentes, e o primeiro a bater
  // é o que de fato bloqueia. Mesmos limiares da métrica "IA hoje" do Admin.
  const razaoTokens = uso && uso.token_cap > 0 ? uso.tokens / uso.token_cap : 0;
  const razaoChamadas = uso && uso.call_cap > 0 ? uso.calls / uso.call_cap : 0;
  const razaoUso = Math.max(razaoTokens, razaoChamadas);
  const percentUso = Math.min(100, Math.round(razaoUso * 100));
  const corBarra =
    razaoUso >= 1 ? "bg-danger" : razaoUso >= 0.8 ? "bg-warning" : "bg-accent-fill";

  return (
    <div className="glass p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/[0.12] text-accent">
          <CreditCard size={16} />
        </div>
        <h2 className="font-semibold text-content">Plano</h2>
      </div>

      <p className="text-sm text-content-2 leading-relaxed">{descricao()}</p>

      {plan.ai_allowed && uso && (
        <div className="mt-4">
          <div
            className="h-2 rounded-full bg-surface-inset overflow-hidden"
            role="progressbar"
            aria-label="Uso da IA hoje"
            aria-valuenow={percentUso}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full ${corBarra} transition-all duration-500`}
              style={{ width: `${percentUso}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-content-3">
            {uso.calls} de {uso.call_cap} conversas ·{" "}
            {uso.tokens.toLocaleString("pt-BR")} de{" "}
            {uso.token_cap.toLocaleString("pt-BR")} tokens
          </p>
          <p className="mt-1 text-xs text-content-3">
            A cota diária renova em {formatResetsAt(uso.resets_at)}.
          </p>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-xs text-danger mt-3">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-3 mt-5">
        {/* Sem `&& !premiumAtivo`: seria redundante, e a mutação provou. Quem
            tem premium ativo já tem `wallet_cap_applies` falso e `ai_allowed`
            verdadeiro, ou seja, `restringido` já é falso. */}
        {restringido && (
          <Button
            onClick={() => abrir("checkout")}
            disabled={carregando !== ""}
            className="bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
          >
            {carregando === "checkout" ? "Abrindo…" : "Assinar"}
          </Button>
        )}

        {temAssinatura && (
          <Button
            variant="outline"
            onClick={() => abrir("portal")}
            disabled={carregando !== ""}
          >
            {carregando === "portal" ? "Abrindo…" : "Gerenciar assinatura"}
          </Button>
        )}
      </div>

      {/* Preço, periodicidade e direito de arrependimento ao lado do botão, e
          não só na página de termos. O art. 6º, III do CDC pede informação
          adequada e clara ANTES de contratar, e "antes" é aqui: é neste botão
          que a decisão é tomada. O Checkout do Stripe repete o valor depois,
          mas quem clica já precisa saber o que está clicando. */}
      {restringido && (
        <p className="text-xs text-content-3 leading-relaxed mt-4">
          {PRECO_MENSAL} por mês, com renovação automática. Cancele quando
          quiser, sem multa. Veja os{" "}
          <Link to="/termos" className="text-accent hover:underline">
            Termos de Uso
          </Link>
          , incluindo o direito de desistir em 7 dias com devolução integral.
        </p>
      )}
    </div>
  );
}
