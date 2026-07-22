from pydantic import BaseModel, ConfigDict
from uuid import UUID
import datetime  # via módulo: o campo `date` colide com o tipo `date` se importado direto
from decimal import Decimal
from app.models.sql_models import TransactionType
from app.schemas.common import LongText, Money, ShortText

class TransactionCreate(BaseModel):
    wallet_id: UUID
    type: TransactionType
    amount: Money  # o sinal vem do type (INCOME/EXPENSE), não do valor
    category: ShortText
    description: LongText | None = None
    date: datetime.date

class TransactionUpdate(BaseModel):
    wallet_id: UUID | None = None
    type: TransactionType | None = None
    amount: Money | None = None
    category: ShortText | None = None
    description: LongText | None = None
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

    model_config = ConfigDict(from_attributes=True)
