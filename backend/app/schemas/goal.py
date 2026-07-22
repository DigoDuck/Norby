from pydantic import BaseModel, Field, model_validator
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from app.models.sql_models import GoalType
from app.schemas.common import MAX_MONEY, Money, MoneyOrZero, ShortText


class GoalCreate(BaseModel):
    name: ShortText
    type: GoalType
    target_amount: Money
    current_amount: MoneyOrZero = Decimal("0")
    category: ShortText | None = None
    deadline: datetime | None = None

    @model_validator(mode="after")
    def check_type(self):
        if self.type == GoalType.BUDGET:
            if not self.category:
                raise ValueError("category é obrigatório para metas BUDGET")
            self.current_amount = Decimal("0")
            self.deadline = None
        else:  # SAVINGS
            self.category = None
        return self


class GoalUpdate(BaseModel):
    name: ShortText | None = None
    target_amount: Money | None = None


class GoalContribute(BaseModel):
    # Negativo é permitido p/ corrigir um aporte; zero não. O teto usa MAX_MONEY
    # nos dois sentidos para o aporte nunca estourar Numeric(15,2).
    amount: Decimal = Field(ge=-MAX_MONEY, le=MAX_MONEY, decimal_places=2)

    @model_validator(mode="after")
    def non_zero(self):
        if self.amount == 0:
            raise ValueError("amount não pode ser zero")
        return self


class GoalResponse(BaseModel):
    id: UUID
    name: str
    type: GoalType
    target_amount: Decimal
    current_amount: Decimal
    category: str | None
    deadline: datetime | None
    created_at: datetime
    progress_pct: float
    remaining: Decimal
