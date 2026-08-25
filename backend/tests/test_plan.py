"""Faixas de acesso do ADR 0001 (issue #44).

`premium_until` é o portão: as quatro faixas do plano são comparações de data,
não estados guardados. Vocabulário em CONTEXT.md — free, trial de IA, premium,
vencido, carência, teto de carteiras.
"""

from datetime import datetime, timedelta, timezone

from app.models.sql_models import User
from app.services.plan_service import ai_allowed, wallet_cap_applies

AGORA = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def _user(**campos) -> User:
    # Objeto solto, sem sessão: os predicados são funções puras sobre o User.
    return User(name="Fulano", email="fulano@test.com", password_hash="x", **campos)


def test_free_user_without_a_trial_has_no_ai():
    free = _user(premium_until=None, ai_trial_ends_at=None)
    assert ai_allowed(free, AGORA) is False


def test_user_inside_the_ai_trial_has_ai():
    em_trial = _user(premium_until=None, ai_trial_ends_at=AGORA + timedelta(days=3))
    assert ai_allowed(em_trial, AGORA) is True


def test_active_premium_has_ai_even_with_the_trial_long_gone():
    # O trial venceu meses atrás; quem paga não depende dele.
    premium = _user(
        premium_until=AGORA + timedelta(days=10),
        ai_trial_ends_at=AGORA - timedelta(days=90),
    )
    assert ai_allowed(premium, AGORA) is True


def test_lapsed_subscription_loses_ai_immediately():
    # Decisão travada: no vencimento a IA para na hora. O que ganha carência
    # de 72h é o teto de carteiras, não a IA.
    vencido = _user(
        premium_until=AGORA - timedelta(minutes=1),
        ai_trial_ends_at=AGORA - timedelta(days=90),
    )
    assert ai_allowed(vencido, AGORA) is False


def test_free_user_is_capped_at_two_wallets():
    free = _user(premium_until=None, ai_trial_ends_at=None)
    assert wallet_cap_applies(free, AGORA) is True


def test_trial_user_is_still_capped_at_two_wallets():
    # O trial concede SÓ IA. Confundir os dois inverteria o teto.
    em_trial = _user(premium_until=None, ai_trial_ends_at=AGORA + timedelta(days=3))
    assert wallet_cap_applies(em_trial, AGORA) is True


def test_active_premium_has_no_wallet_cap():
    premium = _user(premium_until=AGORA + timedelta(days=10))
    assert wallet_cap_applies(premium, AGORA) is False


def test_lapsed_inside_the_grace_window_keeps_the_extra_wallets():
    # Refinamento do #19: a IA para no vencimento, mas as carteiras extras
    # sobrevivem 72h. Bloquear carteira de quem teve o cartão expirado tira a
    # pessoa dos próprios dados na pior hora possível.
    vencido = _user(premium_until=AGORA - timedelta(hours=1))
    assert wallet_cap_applies(vencido, AGORA) is False


def test_lapsed_past_the_grace_window_is_capped_again():
    vencido = _user(premium_until=AGORA - timedelta(days=4))
    assert wallet_cap_applies(vencido, AGORA) is True


def test_at_the_exact_instant_the_period_ends_ai_stops_and_wallets_do_not():
    # Borda da tabela do ADR: `premium_until <= now < premium_until + GRACE`.
    expirando = _user(premium_until=AGORA)
    assert ai_allowed(expirando, AGORA) is False
    assert wallet_cap_applies(expirando, AGORA) is False


def test_at_the_exact_end_of_the_grace_window_the_cap_returns():
    # Borda da tabela do ADR: `now >= premium_until + GRACE`.
    vencido = _user(premium_until=AGORA - timedelta(hours=72))
    assert wallet_cap_applies(vencido, AGORA) is True
