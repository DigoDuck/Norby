"""Webhook do Stripe (issue #45, ADR 0001).

Fixtures assinadas em teste, sem `stripe-mock` e sem a CLI do Stripe: tudo que é
nosso aqui é função pura do payload — "dado este evento, as colunas terminam
assim" — e a CLI exigiria chave real e rede em CI, o mesmo motivo pelo qual este
repo recusou o Snyk.
"""

import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models.sql_models import User

SEGREDO = get_settings().stripe_webhook_secret
AGORA_TS = 1788000000  # 2026-09-01T12:40:00Z, fixo para os testes de ordem


def _assinar(corpo: bytes, segredo: str, ts: int | None = None) -> str:
    """Header `Stripe-Signature` no formato `t=<ts>,v1=<hmac>`.

    O payload assinado é literalmente `f"{ts}.{corpo}"` — é por isso que o
    handler precisa dos BYTES CRUS: deixar o FastAPI parsear e reserializar o
    JSON muda o corpo e invalida a assinatura.
    """
    ts = ts or int(time.time())
    assinatura = hmac.new(
        segredo.encode(), f"{ts}.".encode() + corpo, hashlib.sha256
    ).hexdigest()
    return f"t={ts},v1={assinatura}"


def _evento_assinatura(
    tipo: str = "customer.subscription.updated",
    *,
    event_id: str = "evt_1",
    customer: str = "cus_1",
    subscription: str = "sub_1",
    period_end: int = AGORA_TS + 30 * 86400,
    status: str = "active",
    cancel_at_period_end: bool = False,
    created: int = AGORA_TS,
) -> dict:
    return {
        "id": event_id,
        "type": tipo,
        "created": created,
        "data": {
            "object": {
                "id": subscription,
                "customer": customer,
                "status": status,
                "current_period_end": period_end,
                "cancel_at_period_end": cancel_at_period_end,
            }
        },
    }


async def _postar(client, evento: dict, *, segredo: str | None = None, ts: int | None = None):
    corpo = json.dumps(evento).encode()
    return await client.post(
        "/billing/webhook",
        content=corpo,
        headers={"Stripe-Signature": _assinar(corpo, segredo or SEGREDO, ts)},
    )


async def _usuario_com_customer(client, db_session, email: str = "pagante@test.com") -> User:
    await client.post(
        "/auth/register",
        json={"name": "Pagante", "email": email, "password": "secret123", "accept_privacy": True},
    )
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    user.stripe_customer_id = "cus_1"
    await db_session.commit()
    return user


@pytest.mark.asyncio
async def test_subscription_updated_moves_the_gate(client, db_session):
    user = await _usuario_com_customer(client, db_session)

    res = await _postar(client, _evento_assinatura())
    assert res.status_code == 200, res.text

    await db_session.refresh(user)
    assert user.premium_until == datetime.fromtimestamp(AGORA_TS + 30 * 86400, timezone.utc)
    assert user.subscription_status == "active"
    assert user.cancel_at_period_end is False
    assert user.stripe_subscription_id == "sub_1"


@pytest.mark.asyncio
async def test_a_wrong_signature_is_rejected_and_writes_nothing(client, db_session):
    user = await _usuario_com_customer(client, db_session)

    res = await _postar(client, _evento_assinatura(), segredo="whsec_do_atacante")
    assert res.status_code == 400

    await db_session.refresh(user)
    assert user.premium_until is None


@pytest.mark.asyncio
async def test_an_oversized_body_is_refused_before_the_hmac_runs(client, db_session):
    # Rota anônima que roda HMAC: sem teto de corpo, qualquer um faz o servidor
    # gastar CPU assinando megabytes de lixo. O teto é a proteção certa aqui —
    # rate limit por IP não é, porque atrás do proxy todos os IPs são o mesmo.
    await _usuario_com_customer(client, db_session)

    gigante = b"x" * (64 * 1024 + 1)
    res = await client.post(
        "/billing/webhook",
        content=gigante,
        # Assinatura VÁLIDA para este corpo: prova que a recusa vem do tamanho,
        # não da verificação.
        headers={"Stripe-Signature": _assinar(gigante, SEGREDO)},
    )
    assert res.status_code == 413


@pytest.mark.asyncio
async def test_the_same_event_delivered_twice_changes_nothing_the_second_time(client, db_session):
    # O Stripe reentrega. Sem idempotência, uma reentrega tardia reaplicaria um
    # estado velho por cima do atual.
    user = await _usuario_com_customer(client, db_session)
    primeiro_fim = AGORA_TS + 30 * 86400

    assert (await _postar(client, _evento_assinatura(period_end=primeiro_fim))).status_code == 200
    # MESMO event_id, payload diferente: se reprocessar, a data muda.
    assert (
        await _postar(client, _evento_assinatura(period_end=AGORA_TS + 999 * 86400))
    ).status_code == 200

    await db_session.refresh(user)
    assert user.premium_until == datetime.fromtimestamp(primeiro_fim, timezone.utc)


@pytest.mark.asyncio
async def test_an_event_older_than_the_last_applied_one_is_ignored(client, db_session):
    # O Stripe NÃO garante ordem de entrega. Sem a guarda, dois
    # subscription.updated invertidos empurrariam premium_until para trás.
    user = await _usuario_com_customer(client, db_session)
    recente = AGORA_TS + 30 * 86400

    assert (
        await _postar(
            client,
            _evento_assinatura(event_id="evt_novo", created=AGORA_TS + 100, period_end=recente),
        )
    ).status_code == 200
    assert (
        await _postar(
            client,
            _evento_assinatura(
                event_id="evt_velho", created=AGORA_TS, period_end=AGORA_TS + 1, status="past_due"
            ),
        )
    ).status_code == 200

    await db_session.refresh(user)
    assert user.premium_until == datetime.fromtimestamp(recente, timezone.utc)
    assert user.subscription_status == "active"


@pytest.mark.asyncio
async def test_every_event_is_recorded_even_when_it_matches_nobody(client, db_session):
    # Decisão do #45: evento sem dono não faz o Stripe reentregar por 3 dias.
    # Grava com processed_at nulo e responde 200 — a linha não processada É a
    # trilha de auditoria (`WHERE processed_at IS NULL`).
    from app.models.sql_models import StripeWebhookEvent

    res = await _postar(client, _evento_assinatura(event_id="evt_orfao", customer="cus_ninguem"))
    assert res.status_code == 200

    linha = (
        await db_session.execute(
            select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == "evt_orfao")
        )
    ).scalar_one()
    assert linha.processed_at is None
    assert linha.type == "customer.subscription.updated"
    assert linha.customer_id == "cus_ninguem"


def _evento_checkout(user_id, *, event_id="evt_checkout", created=AGORA_TS) -> dict:
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "created": created,
        "data": {
            "object": {
                "id": "cs_1",
                "mode": "subscription",
                "client_reference_id": str(user_id),
                "customer": "cus_novo",
                "subscription": "sub_novo",
                # O Stripe manda isto aqui — e é exatamente por causa dele que a
                # tabela guarda projeção e não payload cru.
                "customer_details": {"email": "pagante@test.com"},
            }
        },
    }


@pytest.mark.asyncio
async def test_checkout_binds_the_stripe_ids_to_the_user(client, db_session):
    # É a ÚNICA vez que o Stripe ainda não sabe quem é a pessoa: o casamento sai
    # do client_reference_id que nós carimbamos ao criar a sessão.
    await client.post(
        "/auth/register",
        json={"name": "Novo", "email": "novo@test.com", "password": "secret123", "accept_privacy": True},
    )
    user = (await db_session.execute(select(User).where(User.email == "novo@test.com"))).scalar_one()
    assert user.stripe_customer_id is None

    res = await _postar(client, _evento_checkout(user.id))
    assert res.status_code == 200, res.text

    await db_session.refresh(user)
    assert user.stripe_customer_id == "cus_novo"
    assert user.stripe_subscription_id == "sub_novo"
    # O checkout NÃO carrega período: sozinho ele não abre o portão.
    assert user.premium_until is None


@pytest.mark.asyncio
async def test_subscription_created_is_what_opens_the_gate_on_a_first_purchase(client, db_session):
    # Correção do ADR feita durante o #45: com só `updated` e `deleted`, o
    # premium_until da PRIMEIRA compra só chegaria na primeira renovação.
    user = await _usuario_com_customer(client, db_session)
    fim = AGORA_TS + 30 * 86400

    res = await _postar(
        client,
        _evento_assinatura(
            "customer.subscription.created", event_id="evt_criada", period_end=fim
        ),
    )
    assert res.status_code == 200, res.text

    await db_session.refresh(user)
    assert user.premium_until == datetime.fromtimestamp(fim, timezone.utc)


@pytest.mark.asyncio
async def test_an_immediate_cancellation_ends_access_now_not_at_period_end(client, db_session):
    # Cancelamento imediato: o Stripe manda ended_at=agora e o
    # current_period_end AINDA aponta para o futuro. Usar o período aqui
    # deixaria acesso pago em pé depois do fim da assinatura.
    user = await _usuario_com_customer(client, db_session)
    fim_do_periodo = AGORA_TS + 30 * 86400
    encerrada_em = AGORA_TS + 10

    evento = _evento_assinatura(
        "customer.subscription.deleted",
        event_id="evt_cancelada",
        period_end=fim_do_periodo,
        status="canceled",
        created=AGORA_TS + 20,
    )
    evento["data"]["object"]["ended_at"] = encerrada_em

    assert (await _postar(client, evento)).status_code == 200

    await db_session.refresh(user)
    assert user.premium_until == datetime.fromtimestamp(encerrada_em, timezone.utc)
    assert user.subscription_status == "canceled"


@pytest.mark.asyncio
async def test_checkout_arriving_first_does_not_block_the_subscription_that_opens_the_gate(
    client, db_session
):
    # O Stripe cria a assinatura ANTES de a sessão completar, então
    # subscription.created costuma ter `created` MENOR que o do checkout. Se o
    # checkout mover a marca d'água de ordem, o evento que carrega o período
    # entra como "atrasado" e é descartado — e o portão nunca abre na primeira
    # compra. A marca d'água só existe para proteger premium_until, e o checkout
    # não escreve premium_until.
    await client.post(
        "/auth/register",
        json={"name": "Corrida", "email": "corrida@test.com", "password": "secret123", "accept_privacy": True},
    )
    user = (
        await db_session.execute(select(User).where(User.email == "corrida@test.com"))
    ).scalar_one()
    fim = AGORA_TS + 30 * 86400

    # Checkout entregue primeiro, com timestamp MAIOR.
    assert (
        await _postar(client, _evento_checkout(user.id, created=AGORA_TS + 5))
    ).status_code == 200
    await db_session.refresh(user)
    user.stripe_customer_id = "cus_novo"
    await db_session.commit()

    # A assinatura, criada antes, chega depois.
    assert (
        await _postar(
            client,
            _evento_assinatura(
                "customer.subscription.created",
                event_id="evt_criada_atrasada",
                customer="cus_novo",
                created=AGORA_TS,
                period_end=fim,
            ),
        )
    ).status_code == 200

    await db_session.refresh(user)
    assert user.premium_until == datetime.fromtimestamp(fim, timezone.utc)
