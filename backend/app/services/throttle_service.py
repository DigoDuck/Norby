import hashlib
import hmac
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.sql_models import LoginThrottle

settings = get_settings()

# Curva (issue #22): as 3 primeiras falhas não esperam nada. Da 3a falha
# acumulada em diante, a PRÓXIMA tentativa exige min(2**(n-3), 60) segundos
# desde a última falha — 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s...
_FREE_FAILURES = 3
_MAX_WAIT_SECONDS = 60
_PURGE_AFTER = timedelta(hours=24)


def _key_hash(email: str) -> str:
    """HMAC-SHA256 do email normalizado. Nunca gravar o email cru na tabela."""
    normalized = email.strip().lower()
    return hmac.new(
        settings.secret_key.encode(), normalized.encode(), hashlib.sha256
    ).hexdigest()


def _required_wait(failure_count: int) -> int:
    if failure_count < _FREE_FAILURES:
        return 0
    return min(2 ** (failure_count - _FREE_FAILURES), _MAX_WAIT_SECONDS)


async def _purge_expired(db: AsyncSession) -> None:
    # "purgadas no caminho de escrita": sem scheduler neste projeto, a limpeza
    # acontece de carona em toda gravação de falha, não só na chave atual.
    cutoff = datetime.now(timezone.utc) - _PURGE_AFTER
    await db.execute(delete(LoginThrottle).where(LoginThrottle.last_failure_at < cutoff))


async def check_throttle(email: str, db: AsyncSession) -> int | None:
    """None = pode prosseguir. Caso contrário, segundos restantes de espera."""
    row = await db.scalar(
        select(LoginThrottle).where(LoginThrottle.key_hash == _key_hash(email))
    )
    if row is None:
        return None
    wait = _required_wait(row.failure_count)
    if wait == 0:
        return None
    elapsed = (datetime.now(timezone.utc) - row.last_failure_at).total_seconds()
    remaining = wait - elapsed
    return math.ceil(remaining) if remaining > 0 else None


async def record_failure(email: str, db: AsyncSession) -> None:
    """Incrementa o contador da chave. Roda IDÊNTICO exista ou não o email —
    é isso que impede o mecanismo de virar oráculo de enumeração de conta."""
    await _purge_expired(db)
    key = _key_hash(email)
    row = await db.scalar(select(LoginThrottle).where(LoginThrottle.key_hash == key))
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(LoginThrottle(key_hash=key, failure_count=1, last_failure_at=now))
    else:
        row.failure_count += 1
        row.last_failure_at = now
    await db.commit()


async def record_success(email: str, db: AsyncSession) -> None:
    """Login/cadastro bem-sucedido reseta o contador daquela chave."""
    await db.execute(delete(LoginThrottle).where(LoginThrottle.key_hash == _key_hash(email)))
    await db.commit()
