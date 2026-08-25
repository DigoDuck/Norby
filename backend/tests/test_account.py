import pytest


async def make_wallet(ac, name="Main", balance=100):
    res = await ac.post("/wallets/", json={"name": name, "balance": balance})
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_export_contains_own_data_only(make_auth_client, mongo):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    await make_wallet(alice, name="Carteira Alice")
    await make_wallet(bob, name="Carteira Bob")

    res = await alice.get("/auth/me/export")
    assert res.status_code == 200
    assert "attachment" in res.headers.get("content-disposition", "")

    data = res.json()
    names = [w["name"] for w in data["wallets"]]
    assert "Carteira Alice" in names
    assert "Carteira Bob" not in names  # não vaza dado de outro usuário
    assert data["profile"]["email"]
    # estrutura esperada do dump
    for key in ("transactions", "recurring_transactions", "goals", "ai_insights", "chat_history"):
        assert key in data


@pytest.mark.asyncio
async def test_delete_requires_confirmation(make_auth_client):
    alice = await make_auth_client("Alice")
    res = await alice.request(
        "DELETE", "/auth/me", json={"confirm": False, "password": "secret123"}
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_delete_requires_password_field(make_auth_client):
    # Só o access token não basta: sem senha a requisição nem é aceita.
    alice = await make_auth_client("Alice")
    res = await alice.request("DELETE", "/auth/me", json={"confirm": True})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_delete_rejects_wrong_password(make_auth_client, mongo):
    alice = await make_auth_client("Alice")
    res = await alice.request(
        "DELETE", "/auth/me", json={"confirm": True, "password": "senhaerrada1"}
    )
    assert res.status_code == 401
    # A conta continua viva.
    assert (await alice.get("/auth/me")).status_code == 200


@pytest.mark.asyncio
async def test_delete_account_wipes_postgres_and_mongo(make_auth_client, client, mongo):
    alice = await make_auth_client("Alice")
    me = (await alice.get("/auth/me")).json()
    user_id, email = me["id"], me["email"]

    await make_wallet(alice)
    await mongo["chat_history"].insert_one(
        {"user_id": user_id, "session_id": "s1", "messages": []}
    )
    await mongo["ai_insights"].insert_one(
        {"user_id": user_id, "reference_month": "2026-06"}
    )

    res = await alice.request(
        "DELETE", "/auth/me", json={"confirm": True, "password": "secret123"}
    )
    assert res.status_code == 204

    # Mongo: nada do usuário permanece.
    assert await mongo["chat_history"].count_documents({"user_id": user_id}) == 0
    assert await mongo["ai_insights"].count_documents({"user_id": user_id}) == 0

    # Postgres: a conta sumiu → login com as mesmas credenciais falha.
    login = await client.post("/auth/login", json={"email": email, "password": "secret123"})
    assert login.status_code == 401


async def _dar_assinatura(client, db_session, ac, subscription_id="sub_1"):
    """Marca o usuário autenticado como assinante, direto no banco."""
    from sqlalchemy import select
    from app.models.sql_models import User

    me = (await ac.get("/auth/me")).json()
    user = (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()
    user.stripe_customer_id = "cus_1"
    user.stripe_subscription_id = subscription_id
    await db_session.commit()
    return me


@pytest.mark.asyncio
async def test_deleting_a_subscriber_cancels_at_stripe_first(make_auth_client, db_session, mongo, monkeypatch):
    import app.services.account_service as acc

    alice = await make_auth_client("Alice")
    await _dar_assinatura(None, db_session, alice, "sub_da_alice")

    cancelados = []

    async def _falso_cancel(subscription_id):
        cancelados.append(subscription_id)

    monkeypatch.setattr(acc, "cancel_subscription", _falso_cancel)

    res = await alice.request(
        "DELETE", "/auth/me", json={"confirm": True, "password": "secret123"}
    )
    assert res.status_code == 204
    assert cancelados == ["sub_da_alice"]


@pytest.mark.asyncio
async def test_a_refusal_from_stripe_aborts_the_whole_deletion(make_auth_client, client, db_session, mongo, monkeypatch):
    # Assimetria dos modos de falha: exclusão que falhou é recuperável, basta
    # tentar de novo; cartão cobrado por conta que não existe mais vira
    # chargeback e a pessoa não tem nem onde clicar para cancelar.
    import app.services.account_service as acc
    from app.services.billing_service import GatewayCancelFailed

    alice = await make_auth_client("Alice")
    me = await _dar_assinatura(None, db_session, alice)
    user_id, email = me["id"], me["email"]
    await mongo["chat_history"].insert_one({"user_id": user_id, "session_id": "s1", "messages": []})

    async def _cancel_que_falha(subscription_id):
        # GatewayCancelFailed é o contrato da fronteira: o cancel_subscription
        # real embrulha qualquer erro do Stripe nele. Um stub que levanta outra
        # coisa estaria testando um contrato que não existe.
        raise GatewayCancelFailed("stripe fora do ar")

    monkeypatch.setattr(acc, "cancel_subscription", _cancel_que_falha)

    res = await alice.request(
        "DELETE", "/auth/me", json={"confirm": True, "password": "secret123"}
    )
    assert res.status_code == 502

    # NADA foi apagado: nem o Mongo (que vem primeiro no fluxo antigo)...
    assert await mongo["chat_history"].count_documents({"user_id": user_id}) == 1
    # ...nem o Postgres.
    login = await client.post("/auth/login", json={"email": email, "password": "secret123"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_deleting_a_user_without_a_subscription_calls_no_gateway(make_auth_client, mongo, monkeypatch):
    import app.services.account_service as acc

    alice = await make_auth_client("Alice")

    async def _nao_deveria_ser_chamado(subscription_id):
        raise AssertionError("usuário sem assinatura não pode falar com o Stripe")

    monkeypatch.setattr(acc, "cancel_subscription", _nao_deveria_ser_chamado)

    res = await alice.request(
        "DELETE", "/auth/me", json={"confirm": True, "password": "secret123"}
    )
    assert res.status_code == 204
