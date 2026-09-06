import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt  # PyJWT. Era: from jose import jwt
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.sql_models import PasswordResetToken, RefreshToken, User
# Reexportados de propósito: todo o app já importa `hash_password` e
# `verify_password` daqui, e a troca do passlib (#102) não precisa vazar para
# os chamadores. Quem quiser o detalhe do esquema lê o password_service.
from app.services.password_service import (  # noqa: F401
    hash_password,
    needs_update,
    verify_password,
)
# throttle_service não importa auth_service (sem ciclo): reset_password chama
# record_success para tirar a vítima do balde de força bruta ao redefinir.
from app.services.throttle_service import record_success

settings = get_settings()


async def find_user_by_email(email: str, db: AsyncSession) -> User | None:
    """Busca por `func.lower(User.email)`, o mesmo critério usado em toda
    comparação de email do app (fix round 1, issue #22): "Joao@x.com" e
    "joao@x.com" são a MESMA conta.
    """
    normalized = email.strip().lower()
    return await db.scalar(select(User).where(func.lower(User.email) == normalized))


def verify_and_upgrade(plain: str, hashed: str) -> tuple[bool, str | None]:
    """Verifica a senha e devolve um hash novo quando o esquema está obsoleto."""
    if not verify_password(plain, hashed):
        return False, None
    if needs_update(hashed):
        return True, hash_password(plain)
    return True, None

# Hash descartável usado quando o e-mail não existe. Verificar contra ele custa
# o mesmo que verificar contra um hash real, então o tempo de resposta do login
# não revela se o e-mail está cadastrado. Calculado uma vez no import (~200ms).
_DUMMY_HASH = hash_password("norby-dummy-password-nunca-usada")

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes) # Define um tempo de expiração pro token
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm) # Cria o token final


# --- Refresh tokens (opacos, armazenados como hash sha256 no Postgres) ---

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

def _new_refresh(user_id: str, db: AsyncSession) -> str:
    """Enfileira um refresh novo na sessão (SEM commit) e devolve o token cru.

    Separado do commit para a rotação conseguir revogar o antigo e inserir o
    novo numa única transação.
    """
    raw = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    db.add(RefreshToken(user_id=user_id, token_hash=_hash_token(raw), expires_at=expires_at))
    return raw

async def create_refresh_token(user_id: str, db: AsyncSession) -> str:
    """Gera um refresh token opaco, persiste só o hash e retorna o token cru."""
    raw = _new_refresh(user_id, db)
    await db.commit()
    return raw

async def rotate_refresh_token(raw: str, db: AsyncSession) -> tuple[str, str, User] | None:
    """Valida, revoga o antigo e emite o par novo em uma transação só.

    O FOR UPDATE serializa duas rotações do mesmo token: a segunda só lê a linha
    depois do commit da primeira, já com revoked=True. Sem ele, as duas validam
    o token vivo e emitem sucessores diferentes.
    """
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == _hash_token(raw))
        .with_for_update()
    )
    record = result.scalar_one_or_none()
    if record is None:
        return None

    # Token já rotacionado sendo reapresentado é sinal de possível roubo.
    # Revogar todas as sessões evita manter um sucessor comprometido ativo.
    if record.revoked:
        await db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == record.user_id,
                RefreshToken.revoked.is_(False),
            )
            .values(revoked=True)
        )
        await db.commit()
        return None

    if record.expires_at <= datetime.now(timezone.utc):
        return None

    user = await db.get(User, record.user_id)
    if user is None:
        return None

    record.revoked = True
    new_refresh = _new_refresh(str(user.id), db)
    await db.commit()

    return create_access_token(str(user.id)), new_refresh, user

async def revoke_refresh_token(raw: str, db: AsyncSession) -> None:
    """Revoga o refresh do logout. Token já rotacionado é sinal de roubo.

    Apresentar no logout um token que já foi rotacionado significa que quem
    está deslogando não tem o sucessor. Pode ser uma aba velha ou alguém que
    roubou R0, rotacionou para R1 e deixou a vítima com R0. Nos dois casos, a
    resposta segura é derrubar todas as sessões do usuário.

    Continua idempotente: token desconhecido não levanta erro.
    """
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == _hash_token(raw))
        .with_for_update()
    )
    record = result.scalar_one_or_none()
    if record is None:
        return

    if record.revoked:
        await db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == record.user_id,
                RefreshToken.revoked.is_(False),
            )
            .values(revoked=True)
        )
        await db.commit()
        return

    record.revoked = True
    await db.commit()


# --- Recuperação de senha (issue #36) ---------------------------------------
# Mesma forma dos refresh tokens acima, e de propósito: token opaco, só o
# sha256 no banco, uso único. O que muda é o prazo, muito mais curto, porque
# este chega por e-mail e caixa comprometida é o vetor que ele abre.

RESET_TTL = timedelta(minutes=settings.password_reset_expire_minutes)


async def create_password_reset(user_id: str, db: AsyncSession) -> str:
    """Emite um token de recuperação e devolve o valor CRU, para o e-mail."""
    raw = secrets.token_urlsafe(48)
    db.add(
        PasswordResetToken(
            user_id=user_id,
            token_hash=_hash_token(raw),
            expires_at=datetime.now(timezone.utc) + RESET_TTL,
        )
    )
    await db.commit()
    return raw


async def reset_password(raw: str, nova_senha: str, db: AsyncSession) -> bool:
    """Consome o token e troca a senha. Devolve False para token inválido.

    Tudo numa transação só. O `FOR UPDATE` serializa duas apresentações do
    mesmo token: sem ele, duas requisições simultâneas leriam `used_at` nulo e
    as duas trocariam a senha — a segunda sobrescrevendo a primeira, o que
    deixaria a vítima com a senha do atacante.

    Ao trocar a senha, TODA sessão do usuário cai. Quem redefine senha ou
    esqueceu a antiga ou desconfia que alguém a tem; nos dois casos manter um
    refresh token vivo de sete dias anularia o motivo de ter redefinido.
    """
    result = await db.execute(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == _hash_token(raw))
        .with_for_update()
    )
    registro = result.scalar_one_or_none()
    if registro is None:
        return False

    # Token já usado e token expirado respondem igual para fora, mas só o
    # primeiro é sinal: alguém está reapresentando um link que já valeu.
    if registro.used_at is not None:
        return False
    if registro.expires_at <= datetime.now(timezone.utc):
        return False

    user = await db.get(User, registro.user_id)
    if user is None:
        return False

    registro.used_at = datetime.now(timezone.utc)
    # bcrypt é bloqueante (~100-300ms): offload para thread, como auth.py já
    # faz em register/login/delete.
    user.password_hash = await asyncio.to_thread(hash_password, nova_senha)

    # Os OUTROS links pendentes desta pessoa morrem junto. Pedir três e-mails e
    # usar um não pode deixar dois links vivos numa caixa de entrada.
    await db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .values(used_at=datetime.now(timezone.utc))
    )
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
    await db.commit()

    # A vítima de força bruta (check_throttle roda antes da senha na rota de
    # login, ver AGENTS.md) precisa de uma saída: redefinir a senha zera o
    # contador da conta, senão o 429 sobrevive à própria correção.
    await record_success(user.email, db)
    return True
