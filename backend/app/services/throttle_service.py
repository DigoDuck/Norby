import hashlib
import hmac
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
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


def email_key_hash(email: str) -> str:
    """Chave por conta: strip + lower, depois HMAC-SHA256 com o secret do servidor.

    Pública porque `limiter.py` reusa a MESMA chave para `reset_email_key`
    (POST /auth/forgot-password) — throttle de login e teto de recuperação
    protegem a mesma conta, então a chave tem que ser idêntica. HMAC, não
    sha256 puro: sem o secret, ninguém reconstrói a chave rehasheando uma
    lista de e-mails candidatos (o que um hash sozinho permitiria).
    """
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
        select(LoginThrottle).where(LoginThrottle.key_hash == email_key_hash(email))
    )
    if row is None:
        return None
    wait = _required_wait(row.failure_count)
    if wait == 0:
        return None
    elapsed = (datetime.now(timezone.utc) - row.last_failure_at).total_seconds()
    remaining = wait - elapsed
    if remaining <= 0:
        return None
    # Cap defensivo (fix round 3): `remaining` nunca deveria passar de `wait`,
    # mas basta o relógio do host andar pra trás entre a gravação e a leitura
    # para `elapsed` ficar negativo e o Retry-After estourar o teto anunciado.
    return min(math.ceil(remaining), _MAX_WAIT_SECONDS)


async def reserve_attempt(email: str, db: AsyncSession) -> int | None:
    """Reserva a tentativa de login ANTES do bcrypt. None = admitida (e já
    contada); caso contrário, segundos restantes de espera.

    Issue #157 (F6 do scan): check_throttle só lia o contador e a falha era
    gravada depois dos ~200ms do bcrypt, então N tentativas simultâneas liam
    todas o mesmo contador e eram todas admitidas. Aqui checar e contar é UM
    statement: o ON CONFLICT trava a linha da chave e só incrementa se a curva
    admite a tentativa. Recusada, o statement não devolve linha e NADA é
    gravado — o 429 não estende a espera de ninguém, nem a do próprio dono.

    Toda tentativa admitida conta, inclusive a da senha certa: o login bem
    sucedido chama record_success, que apaga a linha. Roda idêntico exista ou
    não o email, pelo mesmo motivo de record_failure (sem oráculo).
    """
    await _purge_expired(db)
    key = email_key_hash(email)
    now = datetime.now(timezone.utc)
    decorrido = func.extract("epoch", now - LoginThrottle.last_failure_at)
    espera = func.least(func.power(2, LoginThrottle.failure_count - _FREE_FAILURES), _MAX_WAIT_SECONDS)
    stmt = (
        pg_insert(LoginThrottle)
        .values(key_hash=key, failure_count=1, last_failure_at=now)
        .on_conflict_do_update(
            index_elements=[LoginThrottle.key_hash],
            set_={"failure_count": LoginThrottle.failure_count + 1, "last_failure_at": now},
            where=or_(LoginThrottle.failure_count < _FREE_FAILURES, decorrido >= espera),
        )
        .returning(LoginThrottle.failure_count)
    )
    admitida = (await db.execute(stmt)).first() is not None
    await db.commit()
    if admitida:
        return None
    # Recusada: a linha existe e está dentro da espera. check_throttle só
    # calcula o Retry-After; se a janela venceu nesse meio-tempo, devolve None
    # e o teto de 1s abaixo evita um 429 sem espera anunciada.
    return await check_throttle(email, db) or 1


async def stamp_failure(email: str, db: AsyncSession) -> None:
    """Após a falha do login, recomeça a espera do FIM da tentativa.

    reserve_attempt grava last_failure_at antes do bcrypt; sem este carimbo a
    espera contaria do início da tentativa e cada degrau da curva encolheria
    pelo tempo do bcrypt (a janela de 1s some inteira). Só atualiza o horário:
    a tentativa já foi contada na reserva.
    """
    await db.execute(
        update(LoginThrottle)
        .where(LoginThrottle.key_hash == email_key_hash(email))
        .values(last_failure_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def record_failure(email: str, db: AsyncSession) -> None:
    """Incrementa o contador da chave. Roda IDÊNTICO exista ou não o email —
    é isso que impede o mecanismo de virar oráculo de enumeração de conta.

    Fix round 1 (issue #22): o read-modify-write anterior (SELECT, depois
    UPDATE/INSERT em Python) perdia incremento sob concorrência — duas falhas
    simultâneas na mesma chave liam o mesmo failure_count e as duas gravavam
    n+1, uma se perdia — e quando as duas eram a PRIMEIRA falha da chave, as
    duas caíam no INSERT e a segunda estourava o índice único como
    IntegrityError não tratado (o middleware global vira isso em 500). Upsert
    do Postgres resolve os dois: o incremento é atômico no banco e o conflito
    é resolvido pelo índice único que já existe em key_hash, sem exception.
    """
    await _purge_expired(db)
    key = email_key_hash(email)
    now = datetime.now(timezone.utc)
    stmt = pg_insert(LoginThrottle).values(key_hash=key, failure_count=1, last_failure_at=now)
    stmt = stmt.on_conflict_do_update(
        index_elements=[LoginThrottle.key_hash],
        set_={
            "failure_count": LoginThrottle.failure_count + 1,
            "last_failure_at": now,
        },
    )
    await db.execute(stmt)
    await db.commit()


async def record_success(email: str, db: AsyncSession) -> None:
    """Login/cadastro bem-sucedido reseta o contador daquela chave."""
    await db.execute(delete(LoginThrottle).where(LoginThrottle.key_hash == email_key_hash(email)))
    await db.commit()
