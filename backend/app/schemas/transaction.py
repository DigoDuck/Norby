from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from app.models.sql_models import TransactionType

class TransactionCreate(BaseModel):
    wallet_id: UUID
    type: TransactionType
    amount: Decimal = Field(gt=0)  # o sinal vem do type (INCOME/EXPENSE), não do valor
    category: str
    description: str | None = None
    date: datetime

class TransactionUpdate(BaseModel):
    wallet_id: UUID | None = None
    type: TransactionType | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    category: str | None = None
    description: str | None = None
    date: datetime | None = None
    
class TransactionResponse(BaseModel):
    id: UUID
    wallet_id: UUID
    type: TransactionType
    amount: Decimal
    category: str
    description: str | None
    date: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True