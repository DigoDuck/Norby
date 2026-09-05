"""Reconciliação preguiçosa de webhook perdido (issue #48, ADR 0001).

O modelo já falha FECHADO: webhook perdido só consegue deixar o acesso vencer,
nunca conceder. Então isto não é proteção de receita — existe para a única
direção que machuca quem paga: a pessoa pagou, o evento se perdeu, e o app diz
que ela não é premium.

Sem agendador: pega carona na requisição, mesmo padrão do
`materialize_due_recurring`.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import app.services.billing_service as billing
from app.config import get_settings
from app.models.sql_models import User


@pytest.fixture(autouse=True)
def sem_memoria_entre_testes():
    # A guarda de repetição é um cache em processo; sem limpar, um teste
    # herdaria a consulta do anterior.
    billing._ULTIMA_CONSULTA.clear()
    yield
    billing._ULTIMA_CONSULTA.clear()


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


def _assinatura(status: str = "active", *, dias: int = 30, ended_at: int | None = None) -> dict:
    """A forma MODERNA do objeto: `current_period_end` mora no ITEM.

    O SDK 15 fixa a versão de API 2026-07-29.dahlia, onde o campo não existe
    mais no topo da assinatura.
    """
    fim = int((datetime.now(timezone.utc) + timedelta(days=dias)).timestamp())
    sub = {
        "id": "sub_1",
        "customer": "cus_1",
        "status": status,
        "cancel_at_period_end": False,
        "items": {"data": [{"id": "si_1", "current_period_end": fim}]},
    }
    if ended_at is not None:
        sub["ended_at"] = ended_at
    return sub


def _stub(monkeypatch, resposta, chamadas: list):
    async def _fake(subscription_id: str) -> dict:
        chamadas.append(subscription_id)
        if isinstance(resposta, Exception):
            raise resposta
        return resposta

    monkeypatch.setattr(billing, "fetch_subscription", _fake)


async def _assinante_vencido(ac, db_session, **campos) -> User:
    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()
    user.stripe_customer_id = "cus_1"
    user.stripe_subscription_id = "sub_1"
    user.subscription_status = "active"
    user.premium_until = datetime.now(timezone.utc) - timedelta(days=2)
    for campo, valor in campos.items():
        setattr(user, campo, valor)
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_a_paying_user_whose_webhook_was_lost_gets_access_back(
    make_auth_client, db_session, monkeypatch, paywall_ligado
):
    alice = await make_auth_client("Alice")
    user = await _assinante_vencido(alice, db_session)
    chamadas = []
    _stub(monkeypatch, _assinatura("active"), chamadas)

    plan = (await alice.get("/auth/me")).json()["plan"]

    assert chamadas == ["sub_1"]
    assert plan["ai_allowed"] is True
    assert plan["wallet_cap_applies"] is False
    await db_session.refresh(user)
    assert user.premium_until > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_a_user_who_never_had_a_period_is_reconciled_too(
    make_auth_client, db_session, monkeypatch
):
    # O caso mais doloroso: o checkout amarrou os ids e o
    # `customer.subscription.created` se perdeu, então `premium_until` é NULL.
    # A condição do ticket ("premium_until <= now") não pega NULL, e sem esta
    # ampliação a pessoa pagaria e ficaria travada para sempre.
    alice = await make_auth_client("Alice")
    user = await _assinante_vencido(alice, db_session, premium_until=None, subscription_status=None)
    chamadas = []
    _stub(monkeypatch, _assinatura("active"), chamadas)

    await alice.get("/auth/me")

    assert chamadas == ["sub_1"]
    await db_session.refresh(user)
    assert user.premium_until is not None
    assert user.premium_until > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_a_free_user_never_pays_for_a_stripe_call(
    make_auth_client, db_session, monkeypatch
):
    alice = await make_auth_client("Alice")
    chamadas = []
    _stub(monkeypatch, _assinatura(), chamadas)

    assert (await alice.get("/auth/me")).status_code == 200
    assert chamadas == []


@pytest.mark.asyncio
async def test_a_stripe_failure_is_logged_and_the_request_still_succeeds(
    make_auth_client, db_session, monkeypatch, caplog
):
    # Reconciliação que dá 500 é PIOR que coluna velha: a coluna velha já está
    # na direção segura.
    alice = await make_auth_client("Alice")
    user = await _assinante_vencido(alice, db_session)
    vencido = user.premium_until
    _stub(monkeypatch, RuntimeError("stripe fora do ar"), [])

    with caplog.at_level("WARNING", logger="norby.billing"):
        res = await alice.get("/auth/me")

    assert res.status_code == 200
    assert any("stripe" in r.message.lower() for r in caplog.records)
    await db_session.refresh(user)
    assert user.premium_until == vencido


@pytest.mark.asyncio
async def test_a_subscription_that_really_ended_is_not_asked_about_again(
    make_auth_client, db_session, monkeypatch
):
    # A armadilha do gatilho: sem parar, quem cancelou de verdade continuaria
    # casando com a condição e faria uma chamada ao Stripe em TODA requisição,
    # para sempre. A própria reconciliação grava o status terminal que a desliga.
    alice = await make_auth_client("Alice")
    user = await _assinante_vencido(alice, db_session)
    fim = int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp())
    chamadas = []
    _stub(monkeypatch, _assinatura("canceled", ended_at=fim), chamadas)

    await alice.get("/auth/me")
    await db_session.refresh(user)
    assert user.subscription_status == "canceled"
    # `ended_at` manda, não o período: cancelamento imediato deixa o período
    # apontando para o futuro e usá-lo daria acesso pago depois do fim.
    assert user.premium_until < datetime.now(timezone.utc)

    billing._ULTIMA_CONSULTA.clear()  # nem com a janela zerada
    await alice.get("/auth/me")
    assert chamadas == ["sub_1"]


@pytest.mark.asyncio
async def test_a_still_lapsed_subscription_is_not_asked_about_on_every_request(
    make_auth_client, db_session, monkeypatch
):
    # `past_due` não é terminal: o Stripe ainda vai retentar. Sem a janela, cada
    # requisição desta pessoa carregaria uma chamada de rede no caminho quente.
    alice = await make_auth_client("Alice")
    await _assinante_vencido(alice, db_session)
    chamadas = []
    _stub(monkeypatch, _assinatura("past_due", dias=-3), chamadas)

    for _ in range(3):
        assert (await alice.get("/auth/me")).status_code == 200

    assert chamadas == ["sub_1"]


@pytest.mark.asyncio
async def test_both_gateway_calls_carry_the_secret_key(monkeypatch):
    """Nada no app configurava `stripe.api_key` — ele era `None`.

    Não é achado desta feature: o `cancel_subscription` já estava assim, e ele
    roda na EXCLUSÃO DE CONTA, onde a recusa do gateway aborta a exclusão de
    propósito. Ou seja, quem tivesse assinatura não conseguiria excluir a conta.
    Invisível até hoje só porque ninguém tem assinatura ainda (#26).
    """
    settings = get_settings()
    antes = settings.stripe_secret_key
    settings.stripe_secret_key = "sk_test_xyz"
    recebidas = {}

    async def _retrieve(subscription_id, **kwargs):
        recebidas["retrieve"] = kwargs.get("api_key")
        # StripeObject de verdade, não dict: o SDK 15 devolve um objeto que
        # NÃO é mapping, e devolver dict aqui escondia o `dict(obj)` quebrado
        # que só aparecia contra o Stripe real (ver test_billing_sdk_boundary).
        return billing.stripe.Subscription.construct_from(
            {"id": subscription_id}, "sk_test_dummy"
        )

    async def _cancel(subscription_id, **kwargs):
        recebidas["cancel"] = kwargs.get("api_key")

    monkeypatch.setattr(billing.stripe.Subscription, "retrieve_async", _retrieve)
    monkeypatch.setattr(billing.stripe.Subscription, "cancel_async", _cancel)
    try:
        await billing.fetch_subscription("sub_1")
        await billing.cancel_subscription("sub_1")
    finally:
        settings.stripe_secret_key = antes

    assert recebidas == {"retrieve": "sk_test_xyz", "cancel": "sk_test_xyz"}
