"""Importação de fatura e extrato pelo chat (spec B): rotas.

Nenhum teste aqui chama o Gemini: `_extrair` é trocado por um falso que devolve
o JSON combinado e uma contagem de tokens.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

import app.services.ai_service as ai
import app.services.import_service as import_service
from app.config import get_settings
from app.models.sql_models import AiUsageDaily, Transaction, User

CSV = b"Data,Valor,Descricao\n10/08/2026,-52.30,Mercado\n"


def _item(**extra):
    base = {
        "date": "2026-08-10", "description": "Mercado", "amount": 52.3,
        "direction": "OUT", "kind": "PURCHASE", "category": "Alimentação",
    }
    return {**base, **extra}


class _Chamadas(list):
    """Lista das partes enviadas; `.prompts` guarda os prompts na mesma ordem."""


@pytest.fixture
def ia_devolve(monkeypatch):
    chamadas = _Chamadas()
    prompts = []

    def _configurar(document_type="ACCOUNT_STATEMENT", items=None, tokens=1000, erro=None):
        async def _falso(parte, prompt):
            chamadas.append(parte)
            prompts.append(prompt)
            if erro:
                raise erro
            return json.dumps({"document_type": document_type, "items": items or [_item()]}), tokens
        monkeypatch.setattr(import_service, "_extrair", _falso)
        chamadas.prompts = prompts
        return chamadas
    return _configurar


@pytest.fixture
def paywall_ligado():
    settings = get_settings()
    antes = settings.paywall_enabled
    settings.paywall_enabled = True
    yield
    settings.paywall_enabled = antes


async def _enviar(ac, conteudo=CSV):
    return await ac.post("/imports/statement", content=conteudo, headers={"Content-Type": "text/csv"})


async def _usuario(ac, db_session) -> User:
    me = (await ac.get("/auth/me")).json()
    return (await db_session.execute(select(User).where(User.id == me["id"]))).scalar_one()


@pytest.mark.asyncio
async def test_preview_returns_the_lines_and_writes_nothing(make_auth_client, db_session, ia_devolve):
    ac = await make_auth_client()
    ia_devolve(items=[_item(), _item(kind="INCOME", direction="IN", description="Salário", category="Salário")])

    res = await _enviar(ac)

    assert res.status_code == 200, res.text
    corpo = res.json()
    assert corpo["document_type"] == "ACCOUNT_STATEMENT"
    assert corpo["format"] == "csv"
    assert [i["launch_as"] for i in corpo["items"]] == ["EXPENSE", "INCOME"]
    total = await db_session.scalar(select(func.count()).select_from(Transaction))
    assert total == 0


@pytest.mark.asyncio
async def test_the_prompt_sent_to_the_ai_names_the_account_holder(make_auth_client, ia_devolve):
    ac = await make_auth_client("Alice")
    chamadas = ia_devolve()

    assert (await _enviar(ac)).status_code == 200
    assert "Alice" in chamadas.prompts[0]


@pytest.mark.asyncio
async def test_preview_preselects_the_only_account_and_the_only_card(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    conta = (await ac.post("/wallets/", json={"name": "Conta", "balance": "100.00"})).json()
    cartao = (await ac.post("/wallets/", json={"name": "Cartão", "kind": "CREDIT_CARD"})).json()
    ia_devolve(items=[_item(kind="CARD_PAYMENT", description="Pagamento de fatura")])

    corpo = (await _enviar(ac)).json()

    assert corpo["default_wallet_id"] == conta["id"]
    assert corpo["default_card_id"] == cartao["id"]
    assert corpo["items"][0]["launch_as"] == "TRANSFER"


@pytest.mark.asyncio
async def test_invoice_preselects_the_card_and_ignores_the_payment_received(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    await ac.post("/wallets/", json={"name": "Conta", "balance": "100.00"})
    cartao = (await ac.post("/wallets/", json={"name": "Cartão", "kind": "CREDIT_CARD"})).json()
    ia_devolve(
        document_type="CARD_INVOICE",
        items=[_item(kind="CARD_PAYMENT", direction="IN", description="Pagamento recebido")],
    )

    corpo = (await _enviar(ac)).json()

    assert corpo["default_wallet_id"] == cartao["id"]
    assert corpo["items"][0]["launch_as"] == "IGNORE"


@pytest.mark.asyncio
async def test_invalid_lines_are_counted(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    ia_devolve(items=[_item(), _item(amount=0), _item(date="ontem")])

    corpo = (await _enviar(ac)).json()

    assert len(corpo["items"]) == 1
    assert corpo["ignored"] == 2


@pytest.mark.asyncio
async def test_empty_or_binary_file_is_422_and_spends_no_quota(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    chamadas = ia_devolve()

    assert (await _enviar(ac, b"")).status_code == 422
    res = await _enviar(ac, b"\x89PNG\r\n\x1a\n\x00\x00")
    assert res.status_code == 422
    assert "CSV, OFX ou PDF" in res.json()["detail"]
    assert chamadas == []


@pytest.mark.asyncio
async def test_more_than_300_lines_is_rejected_with_a_clear_message(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    ia_devolve(items=[_item()] * 301)

    res = await _enviar(ac)

    assert res.status_code == 422
    assert "Divida por período" in res.json()["detail"]


@pytest.mark.asyncio
async def test_file_above_1_mb_is_413(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    chamadas = ia_devolve()

    res = await _enviar(ac, b"a" * (1_048_576 + 1))

    assert res.status_code == 413
    assert chamadas == []


@pytest.mark.asyncio
async def test_ai_failure_returns_503(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    ia_devolve(erro=RuntimeError("Gemini caiu"))

    res = await _enviar(ac)

    assert res.status_code == 503


@pytest.mark.asyncio
async def test_broken_json_from_the_ai_returns_503(make_auth_client, monkeypatch):
    ac = await make_auth_client()

    async def _quebrado(_parte, _prompt):
        return "isto não é json", 500
    monkeypatch.setattr(import_service, "_extrair", _quebrado)

    assert (await _enviar(ac)).status_code == 503


@pytest.mark.asyncio
async def test_the_call_is_debited_from_the_daily_quota(make_auth_client, db_session, ia_devolve):
    ac = await make_auth_client()
    ia_devolve(tokens=27_000)

    assert (await _enviar(ac)).status_code == 200

    user_id = (await _usuario(ac, db_session)).id
    db_session.expire_all()
    uso = (await db_session.execute(
        select(AiUsageDaily).where(AiUsageDaily.user_id == user_id, AiUsageDaily.day == ai.dia_da_cota())
    )).scalar_one()
    assert (uso.tokens, uso.calls) == (27_000, 1)


@pytest.mark.asyncio
async def test_exhausted_quota_is_refused_before_calling_the_ai(make_auth_client, db_session, ia_devolve):
    ac = await make_auth_client()
    chamadas = ia_devolve()
    user = await _usuario(ac, db_session)
    await db_session.merge(AiUsageDaily(user_id=user.id, day=ai.dia_da_cota(), tokens=ai.DAILY_TOKEN_CAP, calls=1))
    await db_session.commit()

    res = await _enviar(ac)

    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "AI_DAILY_CAP_REACHED"
    assert chamadas == []


@pytest.mark.asyncio
async def test_free_user_past_the_trial_cannot_import(make_auth_client, db_session, ia_devolve, paywall_ligado):
    ac = await make_auth_client()
    ia_devolve()
    user = await _usuario(ac, db_session)
    user.ai_trial_ends_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db_session.commit()

    res = await _enviar(ac)

    assert res.status_code == 403
    assert res.json()["detail"]["code"] == "AI_REQUIRES_PREMIUM"


@pytest.mark.asyncio
async def test_truncated_ai_reply_asks_to_split_and_still_debits_the_quota(make_auth_client, db_session, monkeypatch):
    ac = await make_auth_client()

    async def _cortado(_parte, _prompt):
        return None, 30_000
    monkeypatch.setattr(import_service, "_extrair", _cortado)

    res = await _enviar(ac)

    assert res.status_code == 422
    assert "Divida por período" in res.json()["detail"]
    user_id = (await _usuario(ac, db_session)).id
    db_session.expire_all()
    uso = (await db_session.execute(
        select(AiUsageDaily).where(AiUsageDaily.user_id == user_id, AiUsageDaily.day == ai.dia_da_cota())
    )).scalar_one()
    assert (uso.tokens, uso.calls) == (30_000, 1)


@pytest.mark.asyncio
async def test_reimporting_the_same_lines_marks_them_duplicate(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    conta = (await ac.post("/wallets/", json={"name": "Conta", "balance": "100.00"})).json()
    outra = (await ac.post("/wallets/", json={"name": "Outra", "balance": "100.00"})).json()
    await ac.post("/transactions/", json={
        "wallet_id": conta["id"], "type": "EXPENSE", "amount": "52.30",
        "category": "Alimentação", "description": "Mercado", "date": "2026-08-10",
    })
    ia_devolve(items=[_item(), _item(description="Padaria")])

    itens = (await _enviar(ac)).json()["items"]

    assert itens[0]["duplicate_in"] == [conta["id"]]
    assert outra["id"] not in itens[0]["duplicate_in"]
    assert itens[1]["duplicate_in"] == []


@pytest.mark.asyncio
async def test_invoice_payment_already_registered_is_duplicate(make_auth_client, ia_devolve):
    ac = await make_auth_client()
    conta = (await ac.post("/wallets/", json={"name": "Conta", "balance": "1000.00"})).json()
    cartao = (await ac.post("/wallets/", json={"name": "Cartão", "kind": "CREDIT_CARD"})).json()
    await ac.post("/transfers/", json={
        "from_wallet_id": conta["id"], "to_wallet_id": cartao["id"],
        "amount": "300.00", "date": "2026-08-15",
    })
    ia_devolve(items=[_item(kind="CARD_PAYMENT", amount=300, date="2026-08-15", description="Pagamento de fatura")])

    itens = (await _enviar(ac)).json()["items"]

    assert conta["id"] in itens[0]["duplicate_in"]
