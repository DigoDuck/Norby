from pydantic import BaseModel, ConfigDict, model_validator
from uuid import UUID
import datetime  # via módulo: o campo `date` colide com o tipo `date` se importado direto
from decimal import Decimal

from app.schemas.common import LongText, Money


class TransferCreate(BaseModel):
    from_wallet_id: UUID
    to_wallet_id: UUID
    amount: Money
    date: datetime.date
    description: LongText | None = None

    @model_validator(mode="after")
    def _carteiras_distintas(self):
        # O CHECK do banco também barra, mas lá viraria 500; aqui é 422.
        if self.from_wallet_id == self.to_wallet_id:
            raise ValueError("Origem e destino precisam ser carteiras diferentes.")
        return self


class TransferResponse(BaseModel):
    id: UUID
    from_wallet_id: UUID
    to_wallet_id: UUID
    amount: Decimal
    date: datetime.date
    description: str | None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
