import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.sql_models import RefreshToken, User

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password) # Retorna a senha criptografada

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed) # Compara a senha com hash

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes) # Define um tempo de expiração pro token
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm) # Cria o token final


# --- Refresh tokens (opacos, armazenados como hash sha256 no Postgres) ---

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

async def create_refresh_token(user_id: str, db: AsyncSession) -> str:
    """Gera um refresh token opaco, persiste só o hash e retorna o token cru."""
    raw = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    db.add(RefreshToken(user_id=user_id, token_hash=_hash_token(raw), expires_at=expires_at))
    await db.commit()
    return raw

async def _get_valid_refresh(raw: str, db: AsyncSession) -> RefreshToken | None:
    """Retorna o registro do refresh se existir, não estiver revogado e não tiver expirado."""
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(raw)))
    record = result.scalar_one_or_none()
    if record is None or record.revoked:
        return None
    if record.expires_at <= datetime.now(timezone.utc):
        return None
    return record

async def rotate_refresh_token(raw: str, db: AsyncSession) -> tuple[str, str, User] | None:
    """Valida o refresh, revoga o antigo e emite um par novo (rotação). None se inválido."""
    record = await _get_valid_refresh(raw, db)
    if record is None:
        return None
    record.revoked = True  # rotação: o token usado não vale mais
    await db.commit()

    user = await db.get(User, record.user_id)
    if user is None:
        return None

    access = create_access_token(str(user.id))
    new_refresh = await create_refresh_token(str(user.id), db)
    return access, new_refresh, user

async def revoke_refresh_token(raw: str, db: AsyncSession) -> None:
    """Revoga um refresh específico (logout). Silencioso se o token não existir."""
    record = await _get_valid_refresh(raw, db)
    if record is not None:
        record.revoked = True
        await db.commit()