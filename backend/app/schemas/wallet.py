from pydantic import BaseModel, ConfigDict, model_validator
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.models.sql_models import WalletKind
from app.schemas.common import BankSlug, ShortText, SignedMoney

class WalletCreate(BaseModel):
    name: ShortText
    # Conta nasce com saldo >= 0. Cartão nasce com saldo <= 0: o negativo é a
    # fatura em aberto no dia em que a carteira entra no app.
    balance: SignedMoney = Decimal("0.00")
    bank: BankSlug | None = None
    kind: WalletKind = WalletKind.ACCOUNT

    @model_validator(mode="after")
    def _sinal_do_saldo(self):
        if self.kind == WalletKind.ACCOUNT and self.balance < 0:
            raise ValueError("Saldo inicial de conta não pode ser negativo.")
        if self.kind == WalletKind.CREDIT_CARD and self.balance > 0:
            raise ValueError("Saldo inicial de cartão é a fatura em aberto: zero ou negativo.")
        return self

class WalletUpdate(BaseModel):
    # Saldo NÃO é editável à mão: ele deriva das transações (fonte única de verdade).
    name: ShortText | None = None
    # O router aplica `exclude_none`, então mandar `bank: null` NÃO limpa o
    # banco — troca para outro sim. Limpar não é caso real: o catálogo tem
    # "dinheiro" e "outro", que é o que alguém escolhe em vez de "nenhum".
    bank: BankSlug | None = None
    # Trocar o tipo só muda a apresentação; o saldo fica como está.
    kind: WalletKind | None = None

class WalletResponse(BaseModel):
    id: UUID
    name: str
    balance: Decimal
    bank: str | None = None
    kind: WalletKind
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
