"""Contratos da importação de fatura e extrato (spec B)."""
import datetime  # via módulo: o campo `date` colide com o tipo `date` se importado direto
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

MAX_LINHAS = 300

Direcao = Literal["IN", "OUT"]
Kind = Literal["PURCHASE", "INCOME", "REFUND", "CARD_PAYMENT", "TRANSFER"]
LancarComo = Literal["EXPENSE", "INCOME", "TRANSFER", "IGNORE"]


class ItemPrevia(BaseModel):
    date: datetime.date
    description: str
    amount: Decimal
    direction: Direcao
    kind: Kind
    # Sugestão do servidor; a pessoa troca na revisão.
    launch_as: LancarComo
    category: str | None
    # Carteiras onde este lançamento já existe (duplicata depende da carteira
    # escolhida em "Lançar em", que só a revisão conhece).
    duplicate_in: list[UUID]


class ImportPreview(BaseModel):
    document_type: Literal["CARD_INVOICE", "ACCOUNT_STATEMENT"]
    format: Literal["csv", "ofx", "pdf"]
    ignored: int
    default_wallet_id: UUID | None
    default_card_id: UUID | None
    items: list[ItemPrevia]
