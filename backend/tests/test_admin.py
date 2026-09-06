"""Área de admin (issue #23, ADR 0004).

Critério de saída do ticket: usuário comum recebe 404 em TODA rota de admin,
e nenhum endpoint de admin devolve dado financeiro de terceiro. O resto
prova o step-up por senha, a auditoria e as três ações.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, func

import app.routers.admin as admin_router
import app.routers.auth as auth_router
import app.services.admin_service as admin_service
import app.services.account_service as account_service
import app.services.ai_service as ai
from app.config import get_settings
from app.models.sql_models import (
    AdminAction, AiUsageDaily, Transaction, TransactionType, User, Wallet,
)

SENHA = "secret123"  # a senha que o make_auth_client cadastra


@pytest.fixture(autouse=True)
def brevo_configurado(monkeypatch):
    """Vários testes aqui usam /recovery-email sem testar o Brevo em si; sem
    isto, herdariam o `brevo_api_key` vazio do ambiente e cairiam no 503 antes
    de chegar no step-up de senha. Os dois testes sobre o Brevo (configurado e
    ausente) sobrescrevem por cima dentro do próprio teste, e restauram o que
    encontraram — que passa a ser este valor, não o vazio do ambiente."""
    settings = get_settings()
    monkeypatch.setattr(settings, "brevo_api_key", "xkeysib-teste")


async def _usuario(ac, db_session) -> User:
    me = (await ac.get("/auth/me")).json()
    return (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()


async def _promover(ac, db_session) -> User:
    user = await _usuario(ac, db_session)
    user.is_admin = True
    await db_session.commit()
    return user


async def _auditoria(db_session) -> list[AdminAction]:
    db_session.expire_all()
    return list((await db_session.execute(select(AdminAction))).scalars())


def _rotas_de_admin():
    """Toda rota do router, com método e um path preenchido. Varrer o router
    em vez de listar à mão: rota nova entra no teste sem ninguém lembrar."""
    alvo = uuid.uuid4()
    for rota in admin_router.router.routes:
        for metodo in rota.methods:
            yield metodo, rota.path.replace("{user_id}", str(alvo))


@pytest.mark.asyncio
async def test_every_admin_route_answers_404_to_a_regular_user(make_auth_client, db_session):
    comum = await make_auth_client("Comum")
    rotas = list(_rotas_de_admin())
    assert len(rotas) >= 5
    for metodo, path in rotas:
        res = await comum.request(metodo, path, json={"password": SENHA})
        # O corpo é o mesmo do FastAPI para rota inexistente: quem não é admin
        # não fica sabendo que a rota existe.
        assert res.status_code == 404, (metodo, path, res.text)
        assert res.json() == {"detail": "Not Found"}, (metodo, path)


@pytest.mark.asyncio
async def test_an_admin_never_receives_third_party_financial_data(make_auth_client, db_session):
    admin = await make_auth_client("Admin")
    await _promover(admin, db_session)
    alvo_client = await make_auth_client("Alvo")
    alvo = await _usuario(alvo_client, db_session)
    carteira = Wallet(user_id=alvo.id, name="Carteira Secreta", balance=Decimal("1234.56"))
    db_session.add(carteira)
    await db_session.flush()
    db_session.add(Transaction(
        user_id=alvo.id, wallet_id=carteira.id, type=TransactionType.EXPENSE,
        amount=Decimal("987.65"), category="Aluguel", date=datetime.now(timezone.utc).date(),
    ))
    await db_session.commit()

    res = await admin.get("/admin/users")
    assert res.status_code == 200, res.text
    linha = next(u for u in res.json() if u["id"] == str(alvo.id))
    # Garantia por construção: o schema é a lista fechada de campos.
    assert set(linha) == {
        "id", "name", "email", "created_at", "premium_until", "ai_trial_ends_at",
        "subscription_status", "cancel_at_period_end", "is_admin",
    }
    for vazamento in ("Carteira Secreta", "1234.56", "987.65", "Aluguel", "photo"):
        assert vazamento not in res.text


@pytest.mark.asyncio
async def test_me_reports_is_admin(make_auth_client, db_session):
    alice = await make_auth_client("Alice")
    assert (await alice.get("/auth/me")).json()["is_admin"] is False
    await _promover(alice, db_session)
    assert (await alice.get("/auth/me")).json()["is_admin"] is True


@pytest.mark.asyncio
async def test_metrics_count_the_plan_bands_and_todays_ai_calls(make_auth_client, db_session):
    admin = await make_auth_client("Admin")
    await _promover(admin, db_session)
    agora = datetime.now(timezone.utc)
    premium = await _usuario(await make_auth_client("Premium"), db_session)
    premium.premium_until = agora + timedelta(days=20)
    vencido = await _usuario(await make_auth_client("Vencido"), db_session)
    vencido.premium_until = agora - timedelta(days=2)
    vencido.ai_trial_ends_at = agora - timedelta(days=30)
    free = await _usuario(await make_auth_client("Free"), db_session)
    free.ai_trial_ends_at = agora - timedelta(days=1)
    # "Trial": cadastro novo (7 dias de IA), sem premium. O admin também está
    # em trial, porque acabou de se cadastrar: conta como trial e como usuário.
    trial = await _usuario(await make_auth_client("Trial"), db_session)
    db_session.add(AiUsageDaily(user_id=trial.id, day=ai.dia_da_cota(), tokens=900, calls=3))
    db_session.add(AiUsageDaily(user_id=premium.id, day=ai.dia_da_cota(), tokens=100, calls=2))
    db_session.add(AiUsageDaily(
        user_id=premium.id, day=ai.dia_da_cota() - timedelta(days=1), tokens=100, calls=50,
    ))
    await db_session.commit()

    res = await admin.get("/admin/metrics")
    assert res.status_code == 200, res.text
    m = res.json()
    assert m["users"] == 5
    assert m["premium"] == 1
    assert m["expired"] == 1
    assert m["trial"] == 2  # admin + trial
    assert m["mrr_brl"] == 20
    assert m["ai_calls_today"] == 5  # ontem não conta
    assert m["ai_calls_project_limit"] == admin_service.PROJECT_RPD


@pytest.mark.asyncio
async def test_wrong_password_refuses_and_leaves_no_audit_row(make_auth_client, db_session):
    admin = await make_auth_client("Admin")
    await _promover(admin, db_session)
    alvo = await _usuario(await make_auth_client("Alvo"), db_session)

    res = await admin.post(f"/admin/users/{alvo.id}/recovery-email", json={"password": "errada"})
    assert res.status_code == 401, res.text
    assert await _auditoria(db_session) == []


@pytest.mark.asyncio
async def test_acting_on_yourself_is_refused(make_auth_client, db_session):
    admin = await make_auth_client("Admin")
    eu = await _promover(admin, db_session)

    # httpx >=0.20 não aceita `json=` em `.delete()` (verbo sem corpo por
    # design da lib); `.request("DELETE", ...)` manda o corpo que a rota exige.
    res = await admin.request("DELETE", f"/admin/users/{eu.id}", json={"password": SENHA})
    assert res.status_code == 400, res.text
    assert await _auditoria(db_session) == []


@pytest.mark.asyncio
async def test_cancel_calls_stripe_and_ends_premium_now(make_auth_client, db_session, monkeypatch):
    admin = await make_auth_client("Admin")
    eu = await _promover(admin, db_session)
    eu_id = eu.id
    alvo = await _usuario(await make_auth_client("Alvo"), db_session)
    alvo_id = alvo.id
    alvo.stripe_subscription_id = "sub_teste"
    alvo.premium_until = datetime.now(timezone.utc) + timedelta(days=20)
    await db_session.commit()

    cancelados = []

    async def _cancel(subscription_id):
        cancelados.append(subscription_id)

    # A assinatura como o Stripe a devolve DEPOIS de cancelar: copie o
    # dicionário de assinatura cancelada que tests/test_billing_reconcile.py já
    # usa (status "canceled" e `ended_at` no passado imediato).
    async def _fetch(subscription_id):
        return {
            "id": subscription_id,
            "status": "canceled",
            "ended_at": int(datetime.now(timezone.utc).timestamp()),
            "current_period_end": int((datetime.now(timezone.utc) + timedelta(days=20)).timestamp()),
            "cancel_at_period_end": False,
            "created": int(datetime.now(timezone.utc).timestamp()),
        }

    monkeypatch.setattr(admin_service, "cancel_subscription", _cancel)
    monkeypatch.setattr(admin_service, "fetch_subscription", _fetch)

    res = await admin.post(f"/admin/users/{alvo_id}/cancel-subscription", json={"password": SENHA})
    assert res.status_code == 204, res.text
    assert cancelados == ["sub_teste"]

    db_session.expire_all()
    alvo = (await db_session.execute(select(User).where(User.id == alvo_id))).scalar_one()
    assert alvo.premium_until <= datetime.now(timezone.utc)
    alvo_email = alvo.email
    (linha,) = await _auditoria(db_session)
    assert (linha.admin_id, linha.action, linha.target_user_id, linha.target_email) == (
        eu_id, "cancel_subscription", alvo_id, alvo_email,
    )
    assert linha.detail == {"stripe_subscription_id": "sub_teste"}


@pytest.mark.asyncio
async def test_cancel_without_a_subscription_is_a_409(make_auth_client, db_session):
    admin = await make_auth_client("Admin")
    await _promover(admin, db_session)
    alvo = await _usuario(await make_auth_client("Alvo"), db_session)

    res = await admin.post(f"/admin/users/{alvo.id}/cancel-subscription", json={"password": SENHA})
    assert res.status_code == 409, res.text
    assert await _auditoria(db_session) == []


@pytest.mark.asyncio
async def test_delete_reuses_delete_account_and_audits_with_the_email_snapshot(
    make_auth_client, db_session, mongo, monkeypatch
):
    admin = await make_auth_client("Admin")
    await _promover(admin, db_session)
    alvo = await _usuario(await make_auth_client("Alvo"), db_session)
    alvo_id, alvo_email = alvo.id, alvo.email

    async def _nao_deveria_ser_chamado(_id):
        raise AssertionError("sem assinatura, o Stripe não é chamado")

    monkeypatch.setattr(account_service, "cancel_subscription", _nao_deveria_ser_chamado)

    res = await admin.request("DELETE", f"/admin/users/{alvo_id}", json={"password": SENHA})
    assert res.status_code == 204, res.text

    db_session.expire_all()
    assert (await db_session.execute(select(User).where(User.id == alvo_id))).scalar_one_or_none() is None
    (linha,) = await _auditoria(db_session)
    assert (linha.action, linha.target_user_id, linha.target_email) == (
        "delete_account", alvo_id, alvo_email,
    )


@pytest.mark.asyncio
async def test_recovery_email_is_queued_and_audited(make_auth_client, db_session, monkeypatch):
    admin = await make_auth_client("Admin")
    await _promover(admin, db_session)
    alvo = await _usuario(await make_auth_client("Alvo"), db_session)
    alvo_email = alvo.email

    enviados = []

    async def _fake(*, para, assunto, html):
        enviados.append((para, assunto))
        return "msg-1"

    # O helper de envio mora no router de auth e resolve `enviar_email` de lá.
    monkeypatch.setattr(auth_router, "enviar_email", _fake)
    settings = get_settings()
    antes = settings.brevo_api_key
    settings.brevo_api_key = "chave-de-teste"
    try:
        res = await admin.post(f"/admin/users/{alvo.id}/recovery-email", json={"password": SENHA})
    finally:
        settings.brevo_api_key = antes
    assert res.status_code == 202, res.text
    assert enviados and enviados[0][0] == alvo_email
    (linha,) = await _auditoria(db_session)
    assert (linha.action, linha.target_email, linha.detail) == ("send_recovery_email", alvo_email, None)


@pytest.mark.asyncio
async def test_recovery_email_without_brevo_is_a_503(make_auth_client, db_session):
    admin = await make_auth_client("Admin")
    await _promover(admin, db_session)
    alvo = await _usuario(await make_auth_client("Alvo"), db_session)
    settings = get_settings()
    antes = settings.brevo_api_key
    settings.brevo_api_key = ""
    try:
        res = await admin.post(f"/admin/users/{alvo.id}/recovery-email", json={"password": SENHA})
    finally:
        settings.brevo_api_key = antes
    assert res.status_code == 503, res.text
    assert await _auditoria(db_session) == []
