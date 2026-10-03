"""Contratos da importação de fatura e extrato (spec B)."""
import datetime  # via módulo: o campo `date` colide com o tipo `date` se importado direto
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.categories import EXPENSE_CATEGORIES, INCOME_CATEGORIES
from app.schemas.common import Money

MAX_LINHAS = 300

Direcao = Literal["IN", "OUT"]
Kind = Literal["PURCHASE", "INCOME", "REFUND", "CARD_PAYMENT", "TRANSFER"]
LancarComo = Literal["EXPENSE", "INCOME", "TRANSFER", "IGNORE"]
Descricao = Annotated[str, Field(min_length=1, max_length=500)]


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
    # Transferências existentes que esta linha consome, como (origem, destino).
    # A revisão compara com a carteira e o destino escolhidos (Task 2 do plano
    # de 2026-10-03): o servidor não sabe qual será.
    duplicate_pairs: list[tuple[UUID, UUID]]


class ImportPreview(BaseModel):
    document_type: Literal["CARD_INVOICE", "ACCOUNT_STATEMENT"]
    format: Literal["csv", "ofx", "pdf"]
    ignored: int
    default_wallet_id: UUID | None
    default_card_id: UUID | None
    items: list[ItemPrevia]


class LinhaConfirmada(BaseModel):
    date: datetime.date
    description: Descricao
    amount: Money
    direction: Direcao
    # Linha ignorada nem é enviada.
    launch_as: Literal["EXPENSE", "INCOME", "TRANSFER"]
    category: str | None = None
    transfer_wallet_id: UUID | None = None

    @model_validator(mode="after")
    def _coerente(self):
        if self.launch_as == "TRANSFER":
            if self.transfer_wallet_id is None:
                raise ValueError("Transferência precisa da carteira de destino.")
        else:
            lista = EXPENSE_CATEGORIES if self.launch_as == "EXPENSE" else INCOME_CATEGORIES
            if self.category not in lista:
                raise ValueError(f"Categoria inválida para {self.launch_as}: {self.category!r}")
        return self


class ImportConfirm(BaseModel):
    wallet_id: UUID
    already_in_balance: bool
    items: list[LinhaConfirmada] = Field(min_length=1, max_length=MAX_LINHAS)
    # Gerada pela revisão uma vez por prévia. Opcional só para não quebrar um
    # cliente antigo durante o deploy; o front atual sempre manda.
    idempotency_key: UUID | None = None

    @model_validator(mode="after")
    def _transferencia_para_outra_carteira(self):
        for item in self.items:
            if item.launch_as == "TRANSFER" and item.transfer_wallet_id == self.wallet_id:
                raise ValueError("Transferência precisa ir para outra carteira.")
        return self


class ImportResult(BaseModel):
    transactions: int
    transfers: int
