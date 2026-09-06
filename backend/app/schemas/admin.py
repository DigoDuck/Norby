"""Contratos da área de admin (ADR 0004).

`AdminUserOut` é a garantia de que o admin nunca lê dado financeiro de
terceiro: a lista de campos é fechada, e o teste que serializa um usuário com
carteira e transação prova que nada além disto sai. Foto e ids do Stripe ficam
fora de propósito: a foto é dado pessoal que o admin não precisa ver, e no
Dashboard do Stripe a busca é por e-mail.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AdminUserOut(BaseModel):
    id: UUID
    name: str
    email: str
    created_at: datetime
    premium_until: datetime | None
    ai_trial_ends_at: datetime | None
    subscription_status: str | None
    cancel_at_period_end: bool
    is_admin: bool

    model_config = ConfigDict(from_attributes=True)


class AdminMetrics(BaseModel):
    users: int
    premium: int
    trial: int
    expired: int
    mrr_brl: int
    ai_calls_today: int
    ai_calls_project_limit: int


class AdminActionRequest(BaseModel):
    # Step-up: a conta de admin é protegida só por senha, e as três ações agem
    # sobre a conta de OUTRA pessoa. Mesmo contrato do DeleteAccountRequest.
    password: str = Field(min_length=1, max_length=128)
