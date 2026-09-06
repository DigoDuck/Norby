import uuid
from datetime import datetime, date, timezone
from decimal import Decimal
from enum import Enum as PyEnum
from typing import Optional, List

from sqlalchemy import (
    String, DateTime, Date, Numeric, ForeignKey, LargeBinary,
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
    # O unique=True do campo `email` abaixo ficou REDUNDANTE (unicidade em
    # lower(email) já implica unicidade em email) e não é usado por nenhuma
    # consulta, já que todas passam por func.lower. Mantido de propósito:
    # derrubá-lo custa uma migration em produção e economiza uma escrita de
    # índice num INSERT que acontece uma vez por usuário. Quem enxerga o
    # invariante hoje é o índice funcional, não ele.
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

    # --- Plano e assinatura (ADR 0001, issue #19) ----------------------------
    # premium_until é O PORTÃO: o current_period_end do Stripe, e a única coluna
    # que a autorização lê. O Stripe não move essa data quando o cartão falha —
    # ele retenta DENTRO do período já pago — então ela sozinha responde "tem
    # acesso agora", e webhook perdido só consegue expirar acesso, nunca
    # conceder. As quatro faixas estão em app/services/plan_service.py.
    premium_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    # Trial de IA de 7 dias, gravado no cadastro. Concede SÓ IA: quem está em
    # trial continua com teto de 2 carteiras. NULL significa "sem trial", que é
    # o que a migration deixa em todo usuário pré-v2 — o "sem grandfathering"
    # da decisão travada sai de graça, sem backfill.
    ai_trial_ends_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True
    )
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # String crua do Stripe, SÓ exibição. Nenhum portão lê isto: autorizar por um
    # vocabulário que o Stripe pode estender sem avisar faria um status novo cair
    # no else de algum gate e virar concessão ou negação silenciosa.
    subscription_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    # `created` do último evento aplicado. O Stripe NÃO garante ordem de entrega,
    # e dois customer.subscription.updated invertidos empurrariam premium_until
    # para trás ou ressuscitariam um cancel_at_period_end velho.
    stripe_event_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- Foto de perfil (issue #35) -----------------------------------------
    # Só o resultado do processamento mora aqui: 128x128 WebP, ~8 KB. Guardar o
    # ORIGINAL é o que estoura o free tier do Neon, não o fato de ser bytea.
    # `deferred`: sem isto TODA consulta de usuário — ou seja, toda requisição
    # autenticada, via get_current_user — arrastaria o blob do banco à toa.
    photo: Mapped[Optional[bytes]] = mapped_column(
        LargeBinary, nullable=True, deferred=True
    )
    # Existe para o cliente saber DUAS coisas sem baixar nada: se há foto, e se
    # a que ele tem em mãos envelheceu. Nulo significa "sem foto".
    photo_updated_at: Mapped[Optional[datetime]] = mapped_column(
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
    # #130: instante da revogação. Dentro de ROTATION_REUSE_GRACE a partir
    # daqui, reapresentar o token vale como resposta perdida, não como roubo.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")

class PasswordResetToken(Base):
    """Token de recuperação de senha (#36).

    Mesma forma do RefreshToken e pelo mesmo motivo: o token cru vai por e-mail
    e NUNCA é gravado, só o sha256 dele. Vazamento do banco não entrega poder de
    redefinir senha de ninguém.

    `used_at` em vez de deletar a linha: uso único fica sendo um fato registrado,
    e um token reapresentado é distinguível de um token que nunca existiu — o
    que importa para investigar, e é a mesma escolha que `revoked` no refresh.
    """

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


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
    # Banco escolhido (issue #34). NULO = carteira criada antes desta coluna, ou
    # sem banco definido — e o front cai no comportamento antigo. Guarda o slug,
    # nao o nome: o rotulo e a marca sao apresentacao e vivem no frontend.
    bank: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
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
    # `server_default` além do `default`: o banco tem DEFAULT true desde a
    # criação da tabela, e sem declarar isso aqui o autogenerate propõe derrubá-lo
    # em toda migration nova. Derrubar quebraria qualquer INSERT que omita a
    # coluna, então quem estava certo era o banco.
    active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
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
class StripeWebhookEvent(Base):
    """Projeção dos campos que o handler usa — NUNCA o payload cru (ADR 0001).

    Guardar o evento inteiro em JSONB colocaria PII fora do alcance do
    `delete_account`: o `checkout.session.completed` traz
    `customer_details.email`, e o LGPD.md trata exclusão como direito, não
    cortesia. Guardando só o que o handler lê, não existe nada a apagar depois.

    Nada de real se perde. O replay que o payload cru permitiria é redundante
    com a reconciliação preguiçosa (issue #48), que consulta o Stripe ao vivo —
    recuperação melhor do que reprocessar cópia velha. E o painel do Stripe já
    guarda todo evento por 30 dias com botão de reenviar.

    A idempotência mora na PK: `event_id` repetido conflita, e o handler
    responde 200 sem reprocessar.
    """

    __tablename__ = "stripe_webhook_events"

    event_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    # `created` do evento no Stripe, não a hora em que chegou aqui: é ele que
    # ordena os eventos entre si quando a entrega vem fora de ordem.
    stripe_created: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    cancel_at_period_end: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
