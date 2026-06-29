from pydantic import BaseModel, Field
from uuid import UUID
import datetime  # via módulo: o campo `date` colide com o tipo `date` se importado direto
from decimal import Decimal
from app.models.sql_models import TransactionType

class TransactionCreate(BaseModel):
    wallet_id: UUID
    type: TransactionType
    amount: Decimal = Field(gt=0)  # o sinal vem do type (INCOME/EXPENSE), não do valor
    category: str
    description: str | None = None
    date: datetime.date

class TransactionUpdate(BaseModel):
    wallet_id: UUID | None = None
    type: TransactionType | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    category: str | None = None
    description: str | None = None
    date: datetime.date | None = None

class TransactionResponse(BaseModel):
    id: UUID
    wallet_id: UUID
    type: TransactionType
    amount: Decimal
    category: str
    description: str | None
    date: datetime.date
    created_at: datetime.datetime

    class Config:
        from_attributes = True
