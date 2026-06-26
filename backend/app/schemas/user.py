import re

from pydantic import BaseModel, EmailStr, Field, field_validator
from uuid import UUID
from datetime import datetime

class UserRegister(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_forte(cls, v: str) -> str:
        # Regra mínima: pelo menos uma letra e um número (o min_length já garante 8+)
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("A senha deve ter ao menos 8 caracteres, incluindo uma letra e um número")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    
class UserResponse(BaseModel):
    id: UUID
    name: str
    email: str
    created_at: datetime
    
    class Config:
        from_attributes = True
        
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