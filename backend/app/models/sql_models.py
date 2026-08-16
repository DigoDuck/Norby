import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from typing import Optional, List

from sqlalchemy import (
    String, DateTime, Date, Numeric, ForeignKey,
    Enum, Integer, Boolean, CheckConstraint, Index, text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class TransactionType(str, PyEnum):
    INCOME = "INCOME" # Renda
    EXPENSE = "EXPENSE" # Despesas

class RecurrenceFrequency(str, PyEnum):
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"

class GoalType(str, PyEnum):
    SAVINGS = "SAVINGS"  # acumular até um alvo
    BUDGET = "BUDGET"    # teto de gasto mensal por categoria

class User(Base):
    __tablename__= "users"

    # Fix round 1 (issue #22): login/cadastro comparam email por
    # func.lower(User.email) pra não deixar "Joao@x.com" e "joao@x.com"
    # virarem contas distintas (isso permitia contornar o throttle: a
    # conta-sombra podia logar com sucesso e resetar o balde da vítima, cuja
    # chave HMAC já normalizava a caixa). O índice único funcional garante o
    # invariante no banco também, não só na query — ver migration correspondente.
    __table_args__ = (
        Index("ix_users_email_lower", text("lower(email)"), unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # LGPD: prova de que o usuário aceitou a política no cadastro. Validar só no
    # frontend não deixa rastro — sem timestamp não há como demonstrar o aceite.
    privacy_accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # passive_deletes=True: as FKs já têm ondelete="CASCADE", mas sem isto o
    # SQLAlchemy ignora o banco, CARREGA todos os filhos na sessão e emite um
    # DELETE por linha. A conta de demo tem ~170 transações, então DELETE
    # /auth/me virava quase 200 statements onde bastava um.
    wallets: Mapped[List["Wallet"]] = relationship("Wallet", back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    recurring_transactions: Mapped[List["RecurringTransaction"]] = relationship("RecurringTransaction", back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    goals: Mapped[List["Goal"]] = relationship("Goal", back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    refresh_tokens: Mapped[List["RefreshToken"]] = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan", passive_deletes=True)

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)  # sha256 hex do token cru
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")

class LoginThrottle(Base):
    """Atraso progressivo por conta (issue #22), independente de IP.

    Atrás do proxy do Railway `get_remote_address` devolve o mesmo IP pra todo
    mundo (ver "Rate limit atrás do proxy" no AGENTS.md), então login e
    cadastro usam esta tabela em vez do IP: a chave é o HMAC-SHA256 do email
    normalizado (lower + trim) com o secret_key do servidor — o email cru
    NUNCA é gravado. Ver app/services/throttle_service.py para a curva de
    espera e a purga de linhas com mais de 24h.
    """
    __tablename__ = "login_throttles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Fix round 1: indexado porque a purga (DELETE ... WHERE last_failure_at <
    # cutoff, ver throttle_service._purge_expired) roda em TODA falha de
    # login. Sem índice, cada falha varre a tabela inteira — o mecanismo de
    # defesa amplificando o próprio ataque em volume.
    last_failure_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, index=True
    )

class Wallet(Base):
    __tablename__= "wallets"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(15,2), default=Decimal("0.00"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    
    user: Mapped["User"] = relationship("User", back_populates="wallets")
    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="wallet", cascade="all, delete-orphan", passive_deletes=True)
    recurring_transactions: Mapped[List["RecurringTransaction"]] = relationship("RecurringTransaction", back_populates="wallet", cascade="all, delete-orphan", passive_deletes=True)

class Transaction(Base):
    __tablename__ = "transactions"

    # Invariante do domínio no banco, não só no Pydantic: escrita fora da API
    # (script, migration, psql) não pode corromper o saldo com valor negativo.
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    wallet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE"))
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Dia de calendário, sem hora/fuso — a data de uma transação não é um instante.
    date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="transactions")
    wallet: Mapped["Wallet"] = relationship("Wallet", back_populates="transactions")

class RecurringTransaction(Base):
    __tablename__ = "recurring_transactions"

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_recurring_amount_positive"),
        CheckConstraint(
            "day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 28)",
            name="ck_recurring_day_of_month",
        ),
        CheckConstraint(
            "weekday IS NULL OR (weekday BETWEEN 0 AND 6)",
            name="ck_recurring_weekday",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    wallet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE"))
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    frequency: Mapped[RecurrenceFrequency] = mapped_column(Enum(RecurrenceFrequency), nullable=False)
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    weekday: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    next_run_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="recurring_transactions")
    wallet: Mapped["Wallet"] = relationship("Wallet", back_populates="recurring_transactions")

class Goal(Base):
    __tablename__ = "goals"

    __table_args__ = (
        CheckConstraint("target_amount > 0", name="ck_goals_target_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[GoalType] = mapped_column(Enum(GoalType), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    current_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="goals")