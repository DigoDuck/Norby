"""Importação de fatura de cartão e extrato de conta lidos pela IA (spec B).

Dois passos, sem estado no servidor: `ler_arquivo` devolve uma prévia (nada é
gravado) e `confirmar` grava as linhas que a pessoa revisou. O arquivo nunca é
salvo e não entra no histórico do chat.
"""
import json
from datetime import date
from decimal import Decimal, InvalidOperation

from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories import EXPENSE_CATEGORIES, INCOME_CATEGORIES
from app.models.sql_models import (
    Transaction, TransactionType, Transfer, User, Wallet, WalletKind,
)
from app.schemas.common import MAX_MONEY
from app.schemas.imports import MAX_LINHAS, ImportConfirm
from app.services import ai_service
from app.services.transaction_service import apply_delta
from app.services.wallet_service import get_owned_wallet, lock_order

# Teste com 126 lançamentos usou 14,6 mil tokens de saída; folga para o teto
# de 300 linhas. O teto do insight (512) cortaria a lista no meio.
MAX_TOKENS_IMPORTACAO = 32_000
OUTROS = "Outros"
REEMBOLSO = "Reembolso"
KINDS = ("PURCHASE", "INCOME", "REFUND", "CARD_PAYMENT", "TRANSFER")
TIPOS_DOCUMENTO = ("CARD_INVOICE", "ACCOUNT_STATEMENT")

SCHEMA = {
    "type": "object",
    "properties": {
        "document_type": {"type": "string", "enum": list(TIPOS_DOCUMENTO)},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "description": {"type": "string"},
                    "amount": {"type": "number", "description": "valor absoluto, positivo"},
                    "direction": {"type": "string", "enum": ["IN", "OUT"]},
                    "kind": {"type": "string", "enum": list(KINDS)},
                    "category": {
                        "type": "string",
                        "enum": sorted(set(EXPENSE_CATEGORIES) | set(INCOME_CATEGORIES)),
                    },
                },
                "required": ["date", "description", "amount", "direction", "kind", "category"],
            },
        },
    },
    "required": ["document_type", "items"],
}

_PROMPT_BASE = """Você recebe um extrato bancário ou uma fatura de cartão de crédito brasileira.
Extraia TODOS os lançamentos, um item por lançamento, sem pular nenhum e sem inventar.
- document_type: CARD_INVOICE para fatura de cartão, ACCOUNT_STATEMENT para extrato de conta.
- amount: valor absoluto em reais (positivo), exatamente como no documento.
- direction: IN para dinheiro entrando na conta ou crédito na fatura, OUT para saindo.
- kind: PURCHASE (compra ou débito comum), INCOME (salário, Pix recebido de terceiros),
  REFUND (estorno), CARD_PAYMENT (pagamento de fatura de cartão),
  TRANSFER (veja a regra do titular abaixo).
- category: a mais próxima da lista; use "Outros" se nenhuma servir.
- date: data do lançamento em YYYY-MM-DD.
Não inclua linhas de saldo, totais ou cabeçalhos."""


def montar_prompt(titular: str) -> str:
    """Instruções fixas + quem é o titular, que o modelo não tem como adivinhar."""
    return (
        f"{_PROMPT_BASE}\n"
        f"O titular da conta ou do cartão se chama {titular}.\n"
        "- TRANSFER SOMENTE quando a outra ponta é o próprio titular (mesmo nome, "
        "por exemplo Pix ou TED de ou para outra conta dele) ou quando for "
        "movimentação de investimento (aplicação, resgate, caixinha, CDB, RDB, poupança).\n"
        "- Pix, TED ou boleto de ou para QUALQUER OUTRA pessoa ou empresa NÃO é TRANSFER: "
        "use PURCHASE quando o dinheiro sai e INCOME quando entra."
    )


class ArquivoInvalido(Exception):
    """Arquivo que não dá para usar. Vira 422 com esta mensagem no router."""


class ExtracaoFalhou(Exception):
    """A IA respondeu algo que não é o JSON combinado. Vira 503 no router."""


def detectar_formato(conteudo: bytes) -> tuple[str, types.Part]:
    """Formato pelo CONTEÚDO, não pela extensão do nome."""
    if not conteudo.strip():
        raise ArquivoInvalido("O arquivo está vazio.")
    if conteudo.startswith(b"%PDF"):
        return "pdf", types.Part.from_bytes(data=conteudo, mime_type="application/pdf")
    if b"\x00" in conteudo:
        raise ArquivoInvalido("Formato não suportado. Envie CSV, OFX ou PDF.")
    try:
        texto = conteudo.decode("utf-8")
    except UnicodeDecodeError:
        # OFX de banco brasileiro costuma vir em latin-1.
        texto = conteudo.decode("latin-1")
    formato = "ofx" if "OFXHEADER" in texto[:500].upper() or "<OFX>" in texto.upper() else "csv"
    return formato, types.Part.from_text(text=texto)


def sugerir(document_type: str, kind: str, direction: str) -> str:
    """O "Lançar como" que a revisão mostra preenchido (tabela da spec)."""
    if kind == "CARD_PAYMENT":
        # No extrato vira transferência para o cartão. Na fatura ("Pagamento
        # recebido") é o mesmo dinheiro visto do outro lado: lançar recriaria
        # a contagem dupla.
        return "TRANSFER" if document_type == "ACCOUNT_STATEMENT" else "IGNORE"
    if kind == "TRANSFER":
        # Entre contas próprias: como despesa inflaria os gastos.
        return "IGNORE"
    if kind == "REFUND":
        return "INCOME"
    # PURCHASE e INCOME: a direção manda, para a IA não lançar compra como entrada.
    return "INCOME" if direction == "IN" else "EXPENSE"


def _categoria(launch_as: str, kind: str, categoria) -> str | None:
    if kind == "REFUND":
        return REEMBOLSO
    if launch_as == "EXPENSE":
        return categoria if categoria in EXPENSE_CATEGORIES else OUTROS
    if launch_as == "INCOME":
        return categoria if categoria in INCOME_CATEGORIES else OUTROS
    return None


def _data(valor) -> date | None:
    try:
        return date.fromisoformat(str(valor))
    except ValueError:
        return None


def _valor(valor) -> Decimal | None:
    try:
        v = Decimal(str(valor)).quantize(Decimal("0.01"))
        return v if Decimal("0") < v <= MAX_MONEY else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def normalizar(bruto: dict) -> tuple[str, list[dict], int]:
    """Valida o que a IA devolveu. Linha inválida sai e é CONTADA, não some."""
    tipo = bruto.get("document_type")
    if tipo not in TIPOS_DOCUMENTO:
        raise ArquivoInvalido("Não reconheci uma fatura ou um extrato neste arquivo.")
    itens: list[dict] = []
    ignorados = 0
    lista = bruto.get("items")
    for item in lista if isinstance(lista, list) else []:
        if not isinstance(item, dict):
            ignorados += 1
            continue
        data_ = _data(item.get("date"))
        valor = _valor(item.get("amount"))
        descricao = str(item.get("description") or "").strip()[:500]
        direcao = item.get("direction")
        kind = item.get("kind")
        if not (data_ and valor and descricao and direcao in ("IN", "OUT") and kind in KINDS):
            ignorados += 1
            continue
        launch_as = sugerir(tipo, kind, direcao)
        itens.append({
            "date": data_,
            "description": descricao,
            "amount": valor,
            "direction": direcao,
            "kind": kind,
            "launch_as": launch_as,
            "category": _categoria(launch_as, kind, item.get("category")),
            "duplicate_in": [],
        })
    if not itens:
        raise ArquivoInvalido("Não encontrei lançamentos neste arquivo.")
    if len(itens) > MAX_LINHAS:
        raise ArquivoInvalido(
            f"O arquivo tem mais de {MAX_LINHAS} lançamentos. Divida por período e envie em partes."
        )
    return tipo, itens, ignorados


async def marcar_duplicatas(db: AsyncSession, user: User, itens: list[dict]) -> None:
    """Carteiras onde cada linha já existe. A revisão desmarca a linha quando a
    carteira escolhida em "Lançar em" está na lista.

    Transação: mesma data, valor e descrição (reimportar o mesmo arquivo).
    Pagamento de fatura: transferência com mesma data e valor (pago antes pelo
    botão "Pagar fatura", cuja descrição é outra).
    """
    datas = {i["date"] for i in itens}
    transacoes = (await db.execute(
        select(Transaction.wallet_id, Transaction.date, Transaction.amount, Transaction.description)
        .where(Transaction.user_id == user.id, Transaction.date.in_(datas))
    )).all()
    por_transacao: dict[tuple, set] = {}
    for t in transacoes:
        por_transacao.setdefault((t.date, t.amount, t.description), set()).add(t.wallet_id)

    transferencias = (await db.execute(
        select(Transfer.from_wallet_id, Transfer.to_wallet_id, Transfer.date, Transfer.amount)
        .where(Transfer.user_id == user.id, Transfer.date.in_(datas))
    )).all()
    por_transferencia: dict[tuple, set] = {}
    for t in transferencias:
        por_transferencia.setdefault((t.date, t.amount), set()).update({t.from_wallet_id, t.to_wallet_id})

    for item in itens:
        if item["kind"] == "CARD_PAYMENT":
            achadas = por_transferencia.get((item["date"], item["amount"]), set())
        else:
            achadas = por_transacao.get((item["date"], item["amount"], item["description"]), set())
        item["duplicate_in"] = sorted(achadas, key=str)


async def _extrair(parte: types.Part, prompt: str) -> tuple[str | None, int]:
    """Saída de rede da importação. É ela que os testes stubam."""
    resposta = await ai_service.client.aio.models.generate_content(
        model=ai_service.MODELO,
        contents=[parte, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SCHEMA,
            temperature=0,
            max_output_tokens=MAX_TOKENS_IMPORTACAO,
        ),
    )
    candidatos = getattr(resposta, "candidates", None) or [None]
    motivo = getattr(candidatos[0], "finish_reason", None)
    # Corte por limite de tokens vira RETORNO (None), não exceção: uma exceção
    # dentro da `chamada` pularia o débito da cota em `_com_cota`, e esta
    # chamada já custou os tokens.
    if motivo == types.FinishReason.MAX_TOKENS:
        return None, ai_service._tokens_usados(resposta)
    return resposta.text or "", ai_service._tokens_usados(resposta)


async def carteiras_padrao(db: AsyncSession, user: User, tipo: str):
    """(carteira "Lançar em", cartão de destino) pré-selecionados.

    Só quando não há dúvida: fatura com um único cartão, extrato com uma única
    conta, e um único cartão para o pagamento de fatura do extrato.
    """
    carteiras = (await db.execute(
        select(Wallet.id, Wallet.kind).where(Wallet.user_id == user.id)
    )).all()
    cartoes = [c.id for c in carteiras if c.kind == WalletKind.CREDIT_CARD]
    contas = [c.id for c in carteiras if c.kind == WalletKind.ACCOUNT]
    alvo = cartoes if tipo == "CARD_INVOICE" else contas
    return (
        alvo[0] if len(alvo) == 1 else None,
        cartoes[0] if len(cartoes) == 1 else None,
    )


async def ler_arquivo(db: AsyncSession, user: User, conteudo: bytes) -> dict:
    formato, parte = detectar_formato(conteudo)
    prompt = montar_prompt(user.name)
    # `_com_cota` exige a cota antes e debita depois. A lambda resolve
    # `_extrair` na hora da chamada, então o stub do teste vale.
    texto = await ai_service._com_cota(db, str(user.id), lambda: _extrair(parte, prompt))
    if texto is None:
        raise ArquivoInvalido(
            "O arquivo tem lançamentos demais para ler de uma vez. Divida por período e envie em partes."
        )
    try:
        bruto = json.loads(texto)
    except json.JSONDecodeError as erro:
        raise ExtracaoFalhou() from erro
    if not isinstance(bruto, dict):
        raise ExtracaoFalhou()
    tipo, itens, ignorados = normalizar(bruto)
    await marcar_duplicatas(db, user, itens)
    padrao, cartao = await carteiras_padrao(db, user, tipo)
    return {
        "document_type": tipo,
        "format": formato,
        "ignored": ignorados,
        "default_wallet_id": padrao,
        "default_card_id": cartao,
        "items": itens,
    }


async def confirmar(db: AsyncSession, user: User, payload: ImportConfirm) -> dict:
    """Grava as linhas revisadas numa única transação do banco: tudo ou nada.

    Todas as carteiras envolvidas são travadas antes de qualquer escrita, em
    `lock_order` (o mesmo de transferência, edição e recorrência). Dono errado
    (404) ou carteira bloqueada (403) estouram nesse laço, antes de gravar.
    Todas são escrita (`for_write`): recebem linhas novas, mesmo quando o saldo
    não muda.
    """
    destinos = (i.transfer_wallet_id for i in payload.items if i.launch_as == "TRANSFER")
    carteiras = {}
    for wallet_id in lock_order(payload.wallet_id, *destinos):
        carteiras[wallet_id] = await get_owned_wallet(
            wallet_id, user, db, for_update=True, for_write=True
        )
    alvo = carteiras[payload.wallet_id]
    # "Já no saldo": o histórico entra, o saldo fica (spec B, seção Saldo).
    mexe_no_saldo = not payload.already_in_balance

    transacoes = transferencias = 0
    for linha in payload.items:
        if linha.launch_as == "TRANSFER":
            outra = carteiras[linha.transfer_wallet_id]
            origem, destino = (alvo, outra) if linha.direction == "OUT" else (outra, alvo)
            if mexe_no_saldo:
                origem.balance -= linha.amount
                destino.balance += linha.amount
            db.add(Transfer(
                user_id=user.id, from_wallet_id=origem.id, to_wallet_id=destino.id,
                amount=linha.amount, date=linha.date, description=linha.description,
            ))
            transferencias += 1
        else:
            tipo = TransactionType.EXPENSE if linha.launch_as == "EXPENSE" else TransactionType.INCOME
            if mexe_no_saldo:
                apply_delta(alvo, tipo, linha.amount)
            db.add(Transaction(
                user_id=user.id, wallet_id=alvo.id, type=tipo, amount=linha.amount,
                category=linha.category, description=linha.description, date=linha.date,
            ))
            transacoes += 1

    await db.commit()
    return {"transactions": transacoes, "transfers": transferencias}
