from pydantic import BaseModel, Field, model_validator
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from app.models.sql_models import TransactionType, RecurrenceFrequency


class RecurringCreate(BaseModel):
    wallet_id: UUID
    type: TransactionType
    amount: Decimal = Field(gt=0)
    category: str
    description: str | None = None
    frequency: RecurrenceFrequency
    day_of_month: int | None = Field(default=None, ge=1, le=28)
    weekday: int | None = Field(default=None, ge=0, le=6)

    @model_validator(mode="after")
    def check_frequency_fields(self):
        if self.frequency == RecurrenceFrequency.MONTHLY:
            if self.day_of_month is None:
                raise ValueError("day_of_month é obrigatório para frequência MONTHLY")
            self.weekday = None
        else:  # WEEKLY
            if self.weekday is None:
                raise ValueError("weekday é obrigatório para frequência WEEKLY")
            self.day_of_month = None
        return self


class RecurringUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    category: str | None = None
    description: str | None = None
    active: bool | None = None


class RecurringResponse(BaseModel):
    id: UUID
    wallet_id: UUID
    type: TransactionType
    amount: Decimal
    category: str
    description: str | None
    frequency: RecurrenceFrequency
    day_of_month: int | None
    weekday: int | None
    next_run_date: datetime
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True
