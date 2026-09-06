"""Checkout e Customer Portal (issue #46, ADR 0001).

As duas saídas ao Stripe que o USUÁRIO alcança. Checkout HOSPEDADO, não Payment
Element: o Element exigiria abrir a CSP para `js.stripe.com` mais frames, ou
seja, afrouxar a CSP na mesma release que começa a processar pagamento.

As chamadas de rede são stubadas na fronteira do service, como o
`fetch_subscription` do #48.
"""

from datetime import datetime, timedelta, timezone

import pytest
import stripe
from sqlalchemy import select

import app.routers.billing as billing_router
import app.services.billing_service as billing
from app.config import get_settings
from app.models.sql_models import User


@pytest.fixture(autouse=True)
def billing_configurado():
    settings = get_settings()
    antes = (settings.stripe_secret_key, settings.stripe_price_id, settings.app_base_url)
    settings.stripe_secret_key = "sk_test_x"
    settings.stripe_price_id = "price_123"
    # `example.com` e nao um dominio parecido com o nosso: a RFC 2606 reserva
    # este nome exatamente para exemplo e teste, entao ele nao pertence nem
    # pode vir a pertencer a ninguem. O stub anterior era `norby.app`, que
    # nunca foi nosso e pode ser de outra pessoa.
    settings.app_base_url = "https://example.com"
    yield settings
    (settings.stripe_secret_key, settings.stripe_price_id, settings.app_base_url) = antes


@pytest.fixture(autouse=True)
def sem_memoria_de_reconciliacao():
    billing._ULTIMA_CONSULTA.clear()
    yield
    billing._ULTIMA_CONSULTA.clear()


async def _user(ac, db_session, **campos) -> User:
    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()
    for campo, valor in campos.items():
        setattr(user, campo, valor)
    await db_session.commit()
    return user


# --- Checkout ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_checkout_carries_the_user_id_so_the_webhook_can_match(
    make_auth_client, db_session, monkeypatch
):
    # `client_reference_id` é a ÚNICA vez em que o Stripe ainda não sabe quem é
    # a pessoa. Sem ele o primeiro evento não casa com ninguém e a compra fica
    # órfã — o `_dono` do webhook depende disto.
    alice = await make_auth_client("Alice")
    user = await _user(alice, db_session)
    recebido = {}

    async def _fake(**kwargs):
        recebido.update(kwargs)
        return "https://checkout.stripe.com/c/pay/cs_test_1"

    monkeypatch.setattr(billing_router, "create_checkout_session", _fake)

    res = await alice.post("/billing/checkout-session")
    assert res.status_code == 200, res.text
    assert res.json()["url"].startswith("https://checkout.stripe.com/")

    assert recebido["client_reference_id"] == str(user.id)
    assert recebido["price_id"] == "price_123"
    assert recebido["customer_id"] is None  # ainda não tem
    # A volta traz o id da sessão, que é o que fecha a corrida da 1ª compra.
    assert "{CHECKOUT_SESSION_ID}" in recebido["success_url"]
    assert recebido["success_url"].startswith("https://example.com")
    assert recebido["cancel_url"].startswith("https://example.com")


@pytest.mark.asyncio
async def test_a_returning_subscriber_reuses_their_stripe_customer(
    make_auth_client, db_session, monkeypatch
):
    # Quem cancelou e volta NÃO pode virar um segundo customer: o webhook casa
    # por `stripe_customer_id` depois da primeira compra, e um duplicado deixa
    # metade dos eventos sem dono.
    alice = await make_auth_client("Alice")
    await _user(alice, db_session, stripe_customer_id="cus_ja_existe")
    recebido = {}

    async def _fake(**kwargs):
        recebido.update(kwargs)
        return "https://checkout.stripe.com/c/pay/cs_test_2"

    monkeypatch.setattr(billing_router, "create_checkout_session", _fake)

    await alice.post("/billing/checkout-session")
    assert recebido["customer_id"] == "cus_ja_existe"


@pytest.mark.asyncio
async def test_checkout_refuses_loudly_when_billing_is_not_provisioned(
    make_auth_client, billing_configurado
):
    # Sem o #26 feito não há preço. Recusar alto é melhor que criar sessão
    # contra um preço inexistente e devolver erro do Stripe cru na tela.
    billing_configurado.stripe_price_id = ""
    alice = await make_auth_client("Alice")

    res = await alice.post("/billing/checkout-session")
    assert res.status_code == 503


@pytest.mark.asyncio
async def test_a_gateway_failure_is_502_not_500(make_auth_client, monkeypatch):
    alice = await make_auth_client("Alice")

    async def _falha(**_kwargs):
        raise billing_router.GatewayError("stripe fora do ar")

    monkeypatch.setattr(billing_router, "create_checkout_session", _falha)

    res = await alice.post("/billing/checkout-session")
    assert res.status_code == 502
    assert res.json()["detail"]


@pytest.mark.asyncio
async def test_checkout_requires_the_terms_checkbox(monkeypatch):
    # #107: o aceite fica gravado na própria sessão do Stripe, com carimbo de
    # tempo, colado ao pagamento. É a prova que vale numa disputa, e não exige
    # coluna nem modal de re-aceite. Sem este parâmetro o checkbox some em
    # silêncio, por isso o teste existe.
    recebido = {}

    async def _create(**kwargs):
        recebido.update(kwargs)
        return stripe.checkout.Session.construct_from(
            {"id": "cs_1", "url": "https://checkout.stripe.com/c/pay/cs_1"}, "sk_test_dummy"
        )

    monkeypatch.setattr(stripe.checkout.Session, "create_async", _create)

    url = await billing.create_checkout_session(
        client_reference_id="u1",
        price_id="price_1",
        customer_id=None,
        success_url="https://norby.com.br/settings?checkout=success",
        cancel_url="https://norby.com.br/settings?checkout=cancel",
    )

    assert url.startswith("https://checkout.stripe.com/")
    assert recebido["consent_collection"] == {"terms_of_service": "required"}


# --- Customer Portal ---------------------------------------------------------


@pytest.mark.asyncio
async def test_the_portal_needs_a_customer_and_says_so(make_auth_client):
    # Quem nunca comprou não tem customer no Stripe. Isto é 4xx com mensagem,
    # não 500: é estado normal de usuário free, não falha do servidor.
    alice = await make_auth_client("Alice")

    res = await alice.post("/billing/portal-session")
    assert res.status_code == 409
    assert res.json()["detail"]


@pytest.mark.asyncio
async def test_the_portal_returns_a_url_for_a_customer(
    make_auth_client, db_session, monkeypatch
):
    alice = await make_auth_client("Alice")
    await _user(alice, db_session, stripe_customer_id="cus_1")
    recebido = {}

    async def _fake(**kwargs):
        recebido.update(kwargs)
        return "https://billing.stripe.com/p/session/test_1"

    monkeypatch.setattr(billing_router, "create_portal_session", _fake)

    res = await alice.post("/billing/portal-session")
    assert res.status_code == 200
    assert res.json()["url"].startswith("https://billing.stripe.com/")
    assert recebido["customer_id"] == "cus_1"
    assert recebido["return_url"].startswith("https://example.com")


# --- A volta do Checkout: a corrida da primeira compra -----------------------
# Lacuna registrada no ADR 0001 e atribuída a este ticket. O redirect chega
# ANTES do webhook, e a reconciliação preguiçosa (#48) não cobre este instante
# porque exige `stripe_subscription_id` — que é justamente o que ainda não veio.


def _sessao(user_id, *, status="complete", pago="paid") -> dict:
    return {
        "id": "cs_test_1",
        "client_reference_id": str(user_id),
        "customer": "cus_novo",
        "subscription": "sub_novo",
        "status": status,
        "payment_status": pago,
    }


@pytest.mark.asyncio
async def test_coming_back_from_checkout_grants_access_without_waiting_for_the_webhook(
    make_auth_client, db_session, monkeypatch
):
    alice = await make_auth_client("Alice")
    user = await _user(alice, db_session)
    fim = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())

    async def _sessao_fake(_id):
        return _sessao(user.id)

    async def _assinatura_fake(_id):
        return {
            "id": "sub_novo",
            "customer": "cus_novo",
            "status": "active",
            "cancel_at_period_end": False,
            "items": {"data": [{"id": "si_1", "current_period_end": fim}]},
        }

    monkeypatch.setattr(billing, "fetch_checkout_session", _sessao_fake)
    monkeypatch.setattr(billing, "fetch_subscription", _assinatura_fake)

    res = await alice.post("/billing/confirm-checkout", json={"session_id": "cs_test_1"})
    assert res.status_code == 200, res.text

    await db_session.refresh(user)
    assert user.stripe_customer_id == "cus_novo"
    assert user.stripe_subscription_id == "sub_novo"
    assert user.premium_until > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_a_session_belonging_to_someone_else_is_refused(
    make_auth_client, db_session, monkeypatch
):
    # O id da sessão chega pela URL, ou seja, pelo cliente. Sem conferir o
    # `client_reference_id`, quem passasse a sessão de OUTRA pessoa ganharia o
    # premium dela e ainda sequestraria o customer, deixando os eventos da
    # vítima sem dono.
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    dono_bob = await _user(bob, db_session)
    vitima = await _user(alice, db_session)

    async def _sessao_fake(_id):
        return _sessao(dono_bob.id)

    monkeypatch.setattr(billing, "fetch_checkout_session", _sessao_fake)

    res = await alice.post("/billing/confirm-checkout", json={"session_id": "cs_test_1"})
    assert res.status_code == 404

    await db_session.refresh(vitima)
    assert vitima.stripe_customer_id is None
    assert vitima.premium_until is None


@pytest.mark.asyncio
async def test_an_unpaid_session_grants_nothing(make_auth_client, db_session, monkeypatch):
    alice = await make_auth_client("Alice")
    user = await _user(alice, db_session)

    async def _sessao_fake(_id):
        return _sessao(user.id, status="open", pago="unpaid")

    monkeypatch.setattr(billing, "fetch_checkout_session", _sessao_fake)

    res = await alice.post("/billing/confirm-checkout", json={"session_id": "cs_test_1"})
    assert res.status_code == 409

    await db_session.refresh(user)
    assert user.premium_until is None
    assert user.stripe_subscription_id is None


@pytest.mark.asyncio
async def test_a_recent_reconciliation_does_not_block_a_fresh_purchase(
    make_auth_client, db_session, monkeypatch
):
    # Quem estava vencido e voltou a assinar já tinha sido consultado há pouco.
    # Se a janela de 15 min do #48 valesse aqui, a pessoa pagaria e continuaria
    # sem premium até a janela expirar. A COMPRA invalida a janela.
    alice = await make_auth_client("Alice")
    user = await _user(
        alice,
        db_session,
        premium_until=datetime.now(timezone.utc) - timedelta(days=10),
        subscription_status="past_due",
    )
    billing._ULTIMA_CONSULTA[user.id] = datetime.now(timezone.utc)
    fim = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())

    async def _sessao_fake(_id):
        return _sessao(user.id)

    async def _assinatura_fake(_id):
        return {
            "id": "sub_novo",
            "customer": "cus_novo",
            "status": "active",
            "cancel_at_period_end": False,
            "items": {"data": [{"id": "si_1", "current_period_end": fim}]},
        }

    monkeypatch.setattr(billing, "fetch_checkout_session", _sessao_fake)
    monkeypatch.setattr(billing, "fetch_subscription", _assinatura_fake)

    assert (
        await alice.post("/billing/confirm-checkout", json={"session_id": "cs_test_1"})
    ).status_code == 200

    await db_session.refresh(user)
    assert user.premium_until > datetime.now(timezone.utc)


# --- O payload que chega ao Stripe -------------------------------------------
# Os testes acima stubam a função do service, então provam o que o ROUTER passa
# e não o que o Stripe recebe. Duas mutações sobreviveram exatamente aí
# (`client_reference_id` fora do payload, e o customer existente ignorado), o
# que deixaria a primeira compra órfã e criaria customer duplicado sem nada
# ficar vermelho. Este teste stuba o SDK, um nível abaixo.


@pytest.mark.asyncio
async def test_the_payload_that_reaches_stripe_is_complete(monkeypatch):
    recebido = {}

    async def _create(**kwargs):
        recebido.update(kwargs)
        return type("S", (), {"url": "https://checkout.stripe.com/c/pay/cs_1"})()

    monkeypatch.setattr(billing.stripe.checkout.Session, "create_async", _create)

    url = await billing.create_checkout_session(
        client_reference_id="abc-123",
        price_id="price_123",
        customer_id="cus_1",
        success_url="https://example.com/settings?s={CHECKOUT_SESSION_ID}",
        cancel_url="https://example.com/settings",
    )

    assert url == "https://checkout.stripe.com/c/pay/cs_1"
    # Sem isto o primeiro evento não casa com ninguém e a compra fica órfã.
    assert recebido["client_reference_id"] == "abc-123"
    # Sem isto o Stripe cria um SEGUNDO customer para quem já tinha um, e os
    # eventos seguintes deixam de casar por `stripe_customer_id`.
    assert recebido["customer"] == "cus_1"
    assert recebido["mode"] == "subscription"
    assert recebido["line_items"] == [{"price": "price_123", "quantity": 1}]
    assert recebido["locale"] == "pt-BR"
    assert recebido["api_key"]  # a chave nunca era configurada antes do #48


@pytest.mark.asyncio
async def test_a_first_time_buyer_sends_no_customer_at_all(monkeypatch):
    # Mandar `customer=None` faria o Stripe recusar; a chave tem de ficar FORA
    # do payload, não presente e vazia.
    recebido = {}

    async def _create(**kwargs):
        recebido.update(kwargs)
        return type("S", (), {"url": "https://checkout.stripe.com/c/pay/cs_2"})()

    monkeypatch.setattr(billing.stripe.checkout.Session, "create_async", _create)

    await billing.create_checkout_session(
        client_reference_id="abc-123",
        price_id="price_123",
        customer_id=None,
        success_url="https://example.com/settings",
        cancel_url="https://example.com/settings",
    )

    assert "customer" not in recebido
