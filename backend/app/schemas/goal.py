from pydantic import BaseModel, Field, model_validator
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from app.models.sql_models import GoalType


class GoalCreate(BaseModel):
    name: str
    type: GoalType
    target_amount: Decimal = Field(gt=0)
    current_amount: Decimal = Field(default=Decimal("0"), ge=0)
    category: str | None = None
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
    name: str | None = None
    target_amount: Decimal | None = Field(default=None, gt=0)


class GoalContribute(BaseModel):
    amount: Decimal  # negativo é permitido p/ corrigir; zero não

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
