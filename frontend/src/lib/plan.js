import { useAuthStore } from "@/store/authStore";

// Espelha LIMITE_FREE de backend/app/services/wallet_service.py (decisão do #15).
export const LIMITE_CARTEIRAS_GRATIS = 2;

/**
 * O plano do usuário do jeito que a interface precisa dele.
 *
 * O backend continua sendo o portão: aqui a UI só deixa de OFERECER o que ele
 * vai recusar. Sem `plan` (sessão antiga, sem o campo) nada é bloqueado, e a
 * recusa do servidor segue valendo.
 */
export function usePlano() {
  const plan = useAuthStore((s) => s.user?.plan);
  return {
    iaLiberada: plan?.ai_allowed !== false,
    limiteCarteiras: plan?.wallet_cap_applies === true ? LIMITE_CARTEIRAS_GRATIS : null,
  };
}
