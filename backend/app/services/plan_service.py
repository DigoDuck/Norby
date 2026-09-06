"""As quatro faixas de acesso do ADR 0001.

O portão é uma DATA, não um enum de status: `users.premium_until` guarda o
`current_period_end` do Stripe e é a única coluna que a autorização lê. Ver
`docs/adr/0001-modelo-de-assinatura.md` e o glossário em `CONTEXT.md`.

`now` é parâmetro e não gancho de teste: "esse usuário era premium no instante
T" é pergunta legítima (a área de admin, issue #23, vai fazer). Chamador de
produção omite e pega o relógio.
"""

from datetime import datetime, timedelta, timezone

from app.config import get_settings
from app.models.sql_models import User

# 72 horas EXATAS a partir de `premium_until`, não dias de calendário:
# `premium_until` é um instante vindo do Stripe, e dia de calendário exigiria um
# fuso que este modelo não precisa carregar.
GRACE = timedelta(hours=72)

# Trial de IA concedido no cadastro (decisão travada do #15: 7 dias de IA sem
# cartão). Mora aqui, junto das outras regras de plano, e não no router.
AI_TRIAL = timedelta(days=7)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _no_futuro(quando: datetime | None, now: datetime) -> bool:
    return quando is not None and quando > now


def ai_allowed(user: User, now: datetime | None = None) -> bool:
    """IA liberada durante o trial de 7 dias OU enquanto a assinatura vale.

    No vencimento a IA para na hora: o que ganha carência de 72h é o teto de
    carteiras, não isto.
    """
    now = now or _utcnow()
    return _no_futuro(user.ai_trial_ends_at, now) or _no_futuro(user.premium_until, now)


def wallet_cap_applies(user: User, now: datetime | None = None) -> bool:
    """Teto de 2 carteiras: vale para quem nunca assinou e para quem venceu
    há 72h ou mais. Dentro da carência as carteiras extras seguem abertas."""
    now = now or _utcnow()
    if user.premium_until is None:
        return True
    return now >= user.premium_until + GRACE


class PlanRefused(Exception):
    """Uma regra de plano recusou a operação.

    Carrega o `code` do contrato do ADR 0002 — `WALLET_LIMIT_REACHED`,
    `WALLET_READ_ONLY`, `AI_REQUIRES_PREMIUM`. Quem traduz para 403 é o handler
    registrado no main; service neste repo não conhece HTTP.

    O `code` é contrato e NUNCA é reescrito; `message` é livre.
    """

    def __init__(self, code: str, message: str, resets_at: datetime | None = None):
        self.code = code
        self.message = message
        # Só a cota diária (ADR 0003) preenche: quando o bloqueio termina, em UTC.
        self.resets_at = resets_at
        super().__init__(message)


# --- Os dois helpers de enforcement -----------------------------------------
# São os ÚNICOS lugares que leem `paywall_enabled`. Com o flag desligado eles
# reportam liberado, e é de propósito: eles precisam dizer o que a API VAI
# FAZER, não o que a tabela de faixas diz. Se reportassem a faixa real com o
# paywall apagado, a tela bloquearia IA e carteiras que o backend aceita — um
# paywall que atrapalha o usuário sem cobrar de ninguém.


def ai_gate_open(user: User, now: datetime | None = None) -> bool:
    """IA liberada de verdade, considerando o flag de rollout."""
    return not get_settings().paywall_enabled or ai_allowed(user, now)


def wallet_cap_active(user: User, now: datetime | None = None) -> bool:
    """Teto de carteiras valendo de verdade, considerando o flag de rollout."""
    return get_settings().paywall_enabled and wallet_cap_applies(user, now)
