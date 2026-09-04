import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from uuid import UUID
from datetime import datetime

from app.schemas.common import PersonName
from app.services.plan_service import ai_gate_open, wallet_cap_active

class UserRegister(BaseModel):
    name: PersonName
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # LGPD: aceite explícito, registrado no servidor. O frontend já pedia o
    # checkbox, mas o valor não chegava aqui e nada era persistido.
    accept_privacy: bool

    @field_validator("password")
    @classmethod
    def password_forte(cls, v: str) -> str:
        # Regra mínima: pelo menos uma letra e um número (o min_length já garante 8+)
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("A senha deve ter ao menos 8 caracteres, incluindo uma letra e um número")
        return v

    @field_validator("password")
    @classmethod
    def cabe_no_bcrypt(cls, v: str) -> str:
        # O bcrypt trunca em 72 bytes e ignora o resto sem avisar. O max_length
        # do Field conta caracteres, enquanto um acento ocupa mais de um byte.
        if len(v.encode("utf-8")) > 72:
            raise ValueError("A senha deve ter no máximo 72 bytes (acentos contam 2)")
        return v

    @field_validator("accept_privacy")
    @classmethod
    def deve_aceitar(cls, v: bool) -> bool:
        if not v:
            raise ValueError("É necessário aceitar os Termos e a Política de Privacidade")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    # Mesmo tipo do cadastro: sem limite, um nome de 300 chars estourava o
    # String(100) da coluna (500), e o update não pode ser uma porta dos fundos
    # para um nome que o cadastro recusaria.
    name: PersonName | None = None
    email: EmailStr | None = None
    
class PlanResponse(BaseModel):
    """O plano como o frontend precisa vê-lo (ADR 0002).

    Os DOIS BOOLEANOS são a autoridade: eles dizem o que a API vai fazer.
    Sem eles a tela reimplementa a carência de 72h e passa a discordar do
    backend sobre quem é premium. O resto é exibição, para o que booleano não
    conta: "termina em 12/09" precisa de `premium_until` JUNTO de
    `cancel_at_period_end` para não dizer "renova" quando é "acaba", e
    "pagamento recusado" só existe no `subscription_status`.
    """

    ai_allowed: bool
    wallet_cap_applies: bool
    premium_until: datetime | None
    ai_trial_ends_at: datetime | None
    subscription_status: str | None
    cancel_at_period_end: bool


class UserResponse(BaseModel):
    id: UUID
    name: str
    email: str
    created_at: datetime
    plan: PlanResponse

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _deriva_o_plano(cls, data):
        """`plan` não é coluna: sai dos helpers de enforcement a cada resposta.

        Aqui, e não em cada rota, porque são quatro (cadastro, login, GET e PUT
        /auth/me) e esquecer uma deixaria a tela sem plano justamente no login.
        Os booleanos vêm de `ai_gate_open`/`wallet_cap_active`, não dos
        predicados crus: com o flag desligado eles reportam LIBERADO, que é o
        que a API de fato faz.
        """
        if isinstance(data, dict) or not hasattr(data, "premium_until"):
            return data  # já é corpo pronto (ou um UserResponse revalidado)
        return {
            "id": data.id,
            "name": data.name,
            "email": data.email,
            "created_at": data.created_at,
            "plan": {
                "ai_allowed": ai_gate_open(data),
                "wallet_cap_applies": wallet_cap_active(data),
                "premium_until": data.premium_until,
                "ai_trial_ends_at": data.ai_trial_ends_at,
                "subscription_status": data.subscription_status,
                "cancel_at_period_end": data.cancel_at_period_end,
            },
        }

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse # Retorna os dados do usuário junto com o token

class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefreshRequest(BaseModel):
    refresh_token: str

class DeleteAccountRequest(BaseModel):
    confirm: bool
    # Step-up auth: exclusão é irreversível, então não basta ter o access token
    # — é preciso provar posse da senha atual.
    password: str = Field(min_length=1, max_length=128)
