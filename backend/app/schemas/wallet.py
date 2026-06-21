from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from decimal import Decimal

class WalletCreate(BaseModel):
    name: str
    balance: Decimal = Decimal("0.00")

class WalletUpdate(BaseModel):
    # Saldo NÃO é editável à mão: ele deriva das transações (fonte única de verdade).
    name: str | None = None
    
class WalletResponse(BaseModel):
    id: UUID
    name: str
    balance: Decimal
    created_at: datetime
    
    class Config:
        from_attributes = True