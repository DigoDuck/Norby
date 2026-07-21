from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.schemas.common import MoneyOrZero, ShortText

class WalletCreate(BaseModel):
    name: ShortText
    balance: MoneyOrZero = Decimal("0.00")

class WalletUpdate(BaseModel):
    # Saldo NÃO é editável à mão: ele deriva das transações (fonte única de verdade).
    name: ShortText | None = None
    
class WalletResponse(BaseModel):
    id: UUID
    name: str
    balance: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)