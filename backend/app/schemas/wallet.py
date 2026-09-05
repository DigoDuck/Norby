from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.schemas.common import BankSlug, MoneyOrZero, ShortText

class WalletCreate(BaseModel):
    name: ShortText
    balance: MoneyOrZero = Decimal("0.00")
    bank: BankSlug | None = None

class WalletUpdate(BaseModel):
    # Saldo NÃO é editável à mão: ele deriva das transações (fonte única de verdade).
    name: ShortText | None = None
    # O router aplica `exclude_none`, então mandar `bank: null` NÃO limpa o
    # banco — troca para outro sim. Limpar não é caso real: o catálogo tem
    # "dinheiro" e "outro", que é o que alguém escolhe em vez de "nenhum".
    bank: BankSlug | None = None
    
class WalletResponse(BaseModel):
    id: UUID
    name: str
    balance: Decimal
    bank: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)