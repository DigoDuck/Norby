"""A fronteira com o SDK, com objetos de VERDADE do Stripe.

Todo o resto da suíte stuba as saídas de rede com `dict`, o que é certo para
testar comportamento — e foi exatamente por isso que um defeito real passou:
no SDK 15 o `StripeObject` DEIXOU DE SER um mapping, então `dict(obj)` levanta
`TypeError`. Stubando com dict, nada ficava vermelho.

O efeito em produção era grave e silencioso: a reconciliação preguiçosa (#48)
engolia o TypeError no seu `except Exception` e registrava "falhou" para
sempre, e o `confirm-checkout` (#46) devolvia 500 na volta de toda primeira
compra, porque a conversão estava FORA do try que traduz para GatewayError.

Estes testes constroem StripeObject de verdade, sem rede.
"""

import pytest
import stripe

import app.services.billing_service as billing


def _objeto(cls, valores: dict):
    """StripeObject real, montado sem rede — é o que o SDK devolveria."""
    return cls.construct_from(valores, "sk_test_dummy")


@pytest.mark.asyncio
async def test_fetch_subscription_returns_a_plain_dict_from_a_stripe_object(monkeypatch):
    assinatura = _objeto(
        stripe.Subscription,
        {
            "id": "sub_1",
            "customer": "cus_1",
            "status": "active",
            "cancel_at_period_end": False,
            "items": {"data": [{"id": "si_1", "current_period_end": 1788000000}]},
        },
    )

    async def _retrieve(_id, **_kwargs):
        return assinatura

    monkeypatch.setattr(stripe.Subscription, "retrieve_async", _retrieve)

    sub = await billing.fetch_subscription("sub_1")

    assert isinstance(sub, dict)
    assert sub["status"] == "active"
    # O aninhado precisa aceitar `.get()`: é por ele que o `_periodo_fim`
    # encontra o fim do período desde que o campo saiu do topo da assinatura.
    assert billing._periodo_fim(sub) is not None


@pytest.mark.asyncio
async def test_fetch_checkout_session_returns_a_plain_dict(monkeypatch):
    sessao = _objeto(
        stripe.checkout.Session,
        {
            "id": "cs_1",
            "client_reference_id": "abc",
            "customer": "cus_1",
            "subscription": "sub_1",
            "status": "complete",
            "payment_status": "paid",
        },
    )

    async def _retrieve(_id, **_kwargs):
        return sessao

    monkeypatch.setattr(stripe.checkout.Session, "retrieve_async", _retrieve)

    s = await billing.fetch_checkout_session("cs_1")

    assert isinstance(s, dict)
    assert s["client_reference_id"] == "abc"
    assert s["payment_status"] == "paid"


@pytest.mark.asyncio
async def test_a_conversion_failure_still_arrives_as_a_gateway_error(monkeypatch):
    """A conversão mora DENTRO do try de propósito.

    Fora dele, qualquer erro ali escapava do `GatewayError` e o router
    devolvia 500 em vez da mensagem que ele sabe dar.
    """

    class _Quebrado:
        def to_dict(self):
            raise TypeError("nao e um mapping")

    async def _retrieve(_id, **_kwargs):
        return _Quebrado()

    monkeypatch.setattr(stripe.checkout.Session, "retrieve_async", _retrieve)

    with pytest.raises(billing.GatewayError):
        await billing.fetch_checkout_session("cs_1")
