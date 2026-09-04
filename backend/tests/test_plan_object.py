"""O objeto `plan` que o frontend lê (ADR 0002, issue #89).

Os DOIS BOOLEANOS são a autoridade: eles dizem o que a API vai fazer, não o
que a tabela de faixas diz. Sem eles a tela reimplementa a carência de 72h e
passa a discordar do backend sobre quem é premium.

O resto do objeto é exibição: "termina em 12/09" precisa de `premium_until`
JUNTO de `cancel_at_period_end` para não dizer "renova" quando é "acaba", e
"pagamento recusado" só existe no `subscription_status`.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models.sql_models import User

CHAVES = {
    "ai_allowed",
    "wallet_cap_applies",
    "premium_until",
    "ai_trial_ends_at",
    "subscription_status",
    "cancel_at_period_end",
}


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


async def _user(ac, db_session, **campos) -> User:
    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()
    for campo, valor in campos.items():
        setattr(user, campo, valor)
    await db_session.commit()
    return user


async def _plan(ac) -> dict:
    res = await ac.get("/auth/me")
    assert res.status_code == 200, res.text
    return res.json()["plan"]


@pytest.mark.asyncio
async def test_the_plan_object_carries_exactly_the_six_fields_of_the_adr(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    assert set(await _plan(alice)) == CHAVES


# --- As quatro faixas, com o flag LIGADO -------------------------------------


@pytest.mark.asyncio
async def test_a_user_inside_the_ai_trial_has_ai_but_still_has_the_wallet_cap(
    make_auth_client, db_session, paywall_ligado
):
    # O trial concede SÓ IA. Se ele também levantasse o teto, a tela ofereceria
    # a 3ª carteira durante 7 dias e ela sumiria depois.
    alice = await make_auth_client("Alice")
    plan = await _plan(alice)
    assert plan["ai_allowed"] is True
    assert plan["wallet_cap_applies"] is True


@pytest.mark.asyncio
async def test_a_free_user_past_the_trial_has_neither(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    await _user(alice, db_session, ai_trial_ends_at=datetime.now(timezone.utc) - timedelta(days=1))
    plan = await _plan(alice)
    assert plan["ai_allowed"] is False
    assert plan["wallet_cap_applies"] is True


@pytest.mark.asyncio
async def test_active_premium_has_ai_and_no_cap(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    await _user(
        alice,
        db_session,
        ai_trial_ends_at=datetime.now(timezone.utc) - timedelta(days=90),
        premium_until=datetime.now(timezone.utc) + timedelta(days=30),
    )
    plan = await _plan(alice)
    assert plan["ai_allowed"] is True
    assert plan["wallet_cap_applies"] is False


@pytest.mark.asyncio
async def test_inside_the_grace_period_ai_is_already_gone_but_the_cap_is_not_back(
    make_auth_client, db_session, paywall_ligado
):
    # A faixa que o frontend NÃO conseguiria derivar sem errar: venceu há uma
    # hora, a IA parou na hora, e as carteiras extras seguem abertas por 72h.
    alice = await make_auth_client("Alice")
    await _user(
        alice,
        db_session,
        ai_trial_ends_at=datetime.now(timezone.utc) - timedelta(days=90),
        premium_until=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    plan = await _plan(alice)
    assert plan["ai_allowed"] is False
    assert plan["wallet_cap_applies"] is False


@pytest.mark.asyncio
async def test_after_the_grace_period_the_cap_is_back(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    await _user(
        alice,
        db_session,
        ai_trial_ends_at=datetime.now(timezone.utc) - timedelta(days=90),
        premium_until=datetime.now(timezone.utc) - timedelta(hours=73),
    )
    assert (await _plan(alice))["wallet_cap_applies"] is True


# --- Com o flag DESLIGADO ----------------------------------------------------


@pytest.mark.asyncio
async def test_with_the_flag_off_the_booleans_report_permissive(
    make_auth_client, db_session
):
    # Estado de produção no merge deste ticket. Reportar a faixa real aqui faria
    # a tela bloquear IA e carteira que o backend aceita normalmente — paywall
    # que atrapalha sem cobrar de ninguém.
    alice = await make_auth_client("Alice")
    await _user(alice, db_session, ai_trial_ends_at=datetime.now(timezone.utc) - timedelta(days=1))
    plan = await _plan(alice)
    assert plan["ai_allowed"] is True
    assert plan["wallet_cap_applies"] is False


@pytest.mark.asyncio
async def test_with_the_flag_off_the_dates_are_still_the_truth(
    make_auth_client, db_session
):
    # Só os PORTÕES mentem em favor do usuário. Data e status são exibição, e a
    # tela do #25 vai contar com eles para dizer "vence em".
    alice = await make_auth_client("Alice")
    vencimento = datetime.now(timezone.utc) - timedelta(days=10)
    await _user(
        alice, db_session, premium_until=vencimento, subscription_status="past_due",
        cancel_at_period_end=True,
    )
    plan = await _plan(alice)
    assert plan["subscription_status"] == "past_due"
    assert plan["cancel_at_period_end"] is True
    assert plan["premium_until"] is not None
    assert plan["premium_until"].startswith(vencimento.strftime("%Y-%m-%d"))


# --- Os outros dois lugares por onde o usuário viaja --------------------------


@pytest.mark.asyncio
async def test_register_and_login_carry_the_plan_too(client, db_session):
    # O app guarda o usuário do login; sem o plan aqui a tela ficaria sem plano
    # até o primeiro /auth/me.
    corpo = {
        "name": "Bob", "email": "bob_plan@test.com",
        "password": "secret123", "accept_privacy": True,
    }
    cadastro = await client.post("/auth/register", json=corpo)
    assert cadastro.status_code == 201, cadastro.text
    assert set(cadastro.json()["user"]["plan"]) == CHAVES

    login = await client.post(
        "/auth/login", json={"email": corpo["email"], "password": corpo["password"]}
    )
    assert set(login.json()["user"]["plan"]) == CHAVES


# --- O booleano concorda com o que a API faz ---------------------------------
# O ponto do objeto inteiro. Um booleano que discorda do enforcement é pior que
# booleano nenhum: a tela ou esconde o que funciona, ou oferece o que leva 403.


@pytest.mark.asyncio
async def test_ai_allowed_false_matches_a_real_403_from_the_ai_route(
    make_auth_client, db_session, mongo, paywall_ligado
):
    alice = await make_auth_client("Alice")
    await _user(alice, db_session, ai_trial_ends_at=datetime.now(timezone.utc) - timedelta(days=1))

    assert (await _plan(alice))["ai_allowed"] is False
    res = await alice.get("/ai/insight")
    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "AI_REQUIRES_PREMIUM"


@pytest.mark.asyncio
async def test_wallet_cap_applies_true_matches_a_real_403_on_the_third_wallet(
    make_auth_client, db_session, paywall_ligado
):
    alice = await make_auth_client("Alice")
    assert (await _plan(alice))["wallet_cap_applies"] is True

    for nome in ("Primeira", "Segunda"):
        assert (await alice.post("/wallets/", json={"name": nome, "balance": "0.00"})).status_code == 201
    terceira = await alice.post("/wallets/", json={"name": "Terceira", "balance": "0.00"})
    assert terceira.status_code == 403
    assert terceira.json()["detail"]["code"] == "WALLET_LIMIT_REACHED"
