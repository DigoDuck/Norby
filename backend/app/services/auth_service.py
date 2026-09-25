import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import NamedTuple

import jwt  # PyJWT. Era: from jose import jwt
from sqlalchemy import func, or_, select, update
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

def create_access_token(user_id: str, epoch: int) -> str:
    # `epoch` obrigatório (sem default): todo chamador precisa decidir o valor
    # explicitamente, para um novo caminho de emissão não esquecer o claim e
    # reabrir o buraco do #156 em silêncio.
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes) # Define um tempo de expiração pro token
    payload = {"sub": str(user_id), "exp": expire, "ep": epoch}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm) # Cria o token final


# --- Refresh tokens (opacos, armazenados como hash sha256 no Postgres) ---

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

# #175: "manter conectado". Sem marcar, a sessão acaba 24h depois do login,
# sem renovar, e o cookie é de sessão. Marcando, os 7 dias de
# `refresh_token_expire_days` renovam a cada uso, mas nunca além de 90 dias do
# login — antes não havia teto nenhum, e um aparelho perdido e em uso ficava
# logado para sempre.
SESSAO_NAO_LEMBRADA = timedelta(hours=24)
TETO_SESSAO_LEMBRADA = timedelta(days=90)


class RefreshEmitido(NamedTuple):
    """O token cru e o Max-Age do cookie que o leva. `max_age` None = cookie
    de SESSÃO. Ele sozinho não encerra nada (navegadores restauram cookies de
    sessão ao reabrir); quem encerra é o `session_expires_at` no banco."""

    raw: str
    max_age: int | None


def teto_da_sessao(remember: bool) -> datetime:
    """Teto absoluto de uma sessão que começa agora, pelo login."""
    duracao = TETO_SESSAO_LEMBRADA if remember else SESSAO_NAO_LEMBRADA
    return datetime.now(timezone.utc) + duracao


def _new_refresh(
    user_id: str,
    db: AsyncSession,
    *,
    remember: bool = False,
    session_expires_at: datetime | None = None,
) -> RefreshEmitido:
    """Enfileira um refresh novo na sessão (SEM commit).

    Separado do commit para a rotação conseguir revogar o antigo e inserir o
    novo numa única transação. A rotação passa `remember` e
    `session_expires_at` do antecessor: a sessão herda os dois e o teto nunca
    anda. Sem `session_expires_at`, é o início de uma sessão nova.
    """
    agora = datetime.now(timezone.utc)
    if session_expires_at is None:
        session_expires_at = teto_da_sessao(remember)
    if remember:
        expires_at = min(
            agora + timedelta(days=settings.refresh_token_expire_days), session_expires_at
        )
    else:
        expires_at = session_expires_at
    raw = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash_token(raw),
            expires_at=expires_at,
            remember=remember,
            session_expires_at=session_expires_at,
        )
    )
    max_age = max(int((expires_at - agora).total_seconds()), 0) if remember else None
    return RefreshEmitido(raw, max_age)

async def create_refresh_token(
    user_id: str, db: AsyncSession, *, remember: bool = False
) -> RefreshEmitido:
    """Gera um refresh token opaco de sessão nova e persiste só o hash."""
    emitido = _new_refresh(user_id, db, remember=remember)
    await db.commit()
    return emitido


async def emitir_sessao_do_login(
    user: User,
    hash_verificado: str,
    hash_novo: str | None,
    db: AsyncSession,
    *,
    remember: bool = False,
) -> tuple[str, RefreshEmitido] | None:
    """Emite access + refresh do login SÓ se a senha conferida ainda vale (#165).

    O login confere a senha contra o hash lido antes do bcrypt, que leva
    centenas de ms. Se um reset_password commitar nesse intervalo, a cascata
    dele derruba toda sessão existente — mas o refresh deste login, gravado
    depois, escapava e ficava vivo por 7 dias. Quem redefiniu a senha porque
    desconfiava de alguém ficava com esse alguém logado.

    Mesma fila por usuário da rotação e do logout (ver _trava_usuario_do_token):
    trava a linha, relê o hash e o epoch, e só emite se o hash ainda é o que
    foi conferido. Se mudou, a senha que a pessoa digitou já não é a da conta:
    devolve None, e a rota responde como credencial inválida. O epoch vem da
    releitura, não do objeto carregado antes, pelo mesmo motivo.

    `hash_novo` é a regravação do bcrypt legado (verify_and_upgrade), feita
    aqui dentro para sair no mesmo commit do refresh.
    """
    atual = (
        await db.execute(
            select(User.password_hash, User.token_epoch)
            .where(User.id == user.id)
            .with_for_update()
        )
    ).one_or_none()
    if atual is None or atual.password_hash != hash_verificado:
        await db.rollback()
        return None
    if hash_novo:
        user.password_hash = hash_novo
    refresh = _new_refresh(str(user.id), db, remember=remember)
    await db.commit()
    return create_access_token(str(user.id), atual.token_epoch), refresh


async def revoke_all_refresh_tokens(user_id, db: AsyncSession) -> None:
    """Cascata TERMINAL: usada nos 4 pontos que precisam derrubar toda sessão
    de um usuário — as duas cascatas de roubo abaixo (rotação e logout com
    token já rotacionado) e os dois eventos de credencial (reset_password,
    troca de e-mail). NÃO commita: quem chama decide a transação.

    `revoked.is_(False)` sozinho (a query antiga, duplicada nos 4 pontos)
    tinha um buraco: um sucessor rotacionado há menos de ROTATION_REUSE_GRACE
    já está com `revoked=True`, então a query nem o tocava, e seu
    `revoked_at` recente sobrevivia à cascata. Reapresentar esse token depois
    ainda caía no ramo "dentro da janela" de `rotate_refresh_token` — que
    releria o epoch ATUAL do usuário e devolveria um par novo, revivendo a
    sessão que a cascata (ou o reset/troca de e-mail) dizia ter encerrado.
    `or_(revoked IS false, revoked_at IS NOT NULL)` cobre as duas formas de
    "ainda não é terminal": nunca revogado, ou revogado mas com graça viva.
    Zerar `revoked_at` no UPDATE é o que torna terminal — sem `revoked_at`,
    a próxima reapresentação cai fora do `IS NOT NULL` da janela e nunca mais
    volta.
    """
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            or_(RefreshToken.revoked.is_(False), RefreshToken.revoked_at.is_not(None)),
        )
        .values(revoked=True, revoked_at=None)
    )


async def _trava_usuario_do_token(raw: str, db: AsyncSession) -> RefreshToken | None:
    """Trava o USUÁRIO dono do token e só depois o próprio token (#165).

    Ordem única de locks para tudo que pode abrir uma cascata: `users` primeiro,
    `refresh_tokens` depois. reset_password e a troca de e-mail já seguem essa
    ordem (o UPDATE em `users` sai no autoflush, antes da cascata). A rotação e
    o logout travavam o token direto, e duas cascatas do mesmo usuário
    seguravam cada uma o seu token enquanto o UPDATE da cascata precisava do
    token da outra — deadlock, e o Postgres matava uma delas com 500. Ordenar
    as linhas de `refresh_tokens` por id não resolveria: o primeiro lock já foi
    tomado fora de ordem.

    Travar o usuário serializa por pessoa, não globalmente. De quebra fecha a
    corrida de READ COMMITTED da mesma issue: um sucessor que a rotação
    commitasse enquanto a cascata esperava lock ficava fora do snapshot do
    UPDATE e sobrevivia. Com a fila no usuário, ou a rotação commita antes da
    cascata começar (e a cascata enxerga o sucessor), ou só roda depois dela
    (e encontra o próprio token já terminal).

    A primeira leitura, sem lock, só descobre de quem é o token; a segunda,
    já com o usuário travado, é a que vale.
    """
    token_hash = _hash_token(raw)
    user_id = await db.scalar(
        select(RefreshToken.user_id).where(RefreshToken.token_hash == token_hash)
    )
    if user_id is None:
        return None
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
    )
    return result.scalar_one_or_none()


async def rotate_refresh_token(raw: str, db: AsyncSession) -> tuple[str, RefreshEmitido, User] | None:
    """Valida, revoga o antigo e emite o par novo em uma transação só.

    O FOR UPDATE serializa duas rotações do mesmo token: a segunda só lê a linha
    depois do commit da primeira, já com revoked=True. Sem ele, as duas validam
    o token vivo e emitem sucessores diferentes. O usuário é travado antes do
    token, ver _trava_usuario_do_token.
    """
    record = await _trava_usuario_do_token(raw, db)
    if record is None:
        return None

    if record.revoked:
        agora = datetime.now(timezone.utc)
        dentro_da_janela = (
            record.revoked_at is not None and agora - record.revoked_at <= ROTATION_REUSE_GRACE
        )
        if not dentro_da_janela:
            # Token já rotacionado sendo reapresentado fora da janela é sinal
            # de roubo. Revogar todas as sessões evita manter um sucessor
            # comprometido ativo — cascata TERMINAL, ver o docstring de
            # revoke_all_refresh_tokens (cobre também quem estava dentro da
            # PRÓPRIA janela de graça no instante da cascata).
            await revoke_all_refresh_tokens(record.user_id, db)
            await db.commit()
            return None
        # Dentro da janela: sucessor NOVO para quem ficou com o antecessor. O
        # sucessor anterior continua válido; o servidor só tem o hash dele.
        # Mas nunca além do teto da sessão (#175): a janela não olhava
        # validade, e um token rotacionado segundos antes do teto ganharia
        # vida depois dele.
        if record.session_expires_at <= agora:
            return None
        user = await db.get(User, record.user_id)
        if user is None:
            return None
        new_refresh = _new_refresh(
            str(user.id),
            db,
            remember=record.remember,
            session_expires_at=record.session_expires_at,
        )
        await db.commit()
        return create_access_token(str(user.id), user.token_epoch), new_refresh, user

    if record.expires_at <= datetime.now(timezone.utc):
        return None

    user = await db.get(User, record.user_id)
    if user is None:
        return None

    record.revoked = True
    record.revoked_at = datetime.now(timezone.utc)
    new_refresh = _new_refresh(
        str(user.id), db, remember=record.remember, session_expires_at=record.session_expires_at
    )
    await db.commit()

    return create_access_token(str(user.id), user.token_epoch), new_refresh, user

async def revoke_refresh_token(raw: str, db: AsyncSession) -> None:
    """Revoga o refresh do logout. Token já rotacionado é sinal de roubo.

    Apresentar no logout um token que já foi rotacionado significa que quem
    está deslogando não tem o sucessor. Pode ser uma aba velha ou alguém que
    roubou R0, rotacionou para R1 e deixou a vítima com R0. Nos dois casos, a
    resposta segura é derrubar todas as sessões do usuário.

    Continua idempotente: token desconhecido não levanta erro. Mesma ordem de
    locks da rotação (usuário, depois token): ver _trava_usuario_do_token.
    """
    record = await _trava_usuario_do_token(raw, db)
    if record is None:
        return

    # Cascata TERMINAL (ver revoke_all_refresh_tokens): o logout nunca
    # consulta a janela de tolerância (#130, SEC-01), e ela zera todo
    # `revoked_at` do usuário de propósito — um refresh apresentado segundos
    # depois não pode ler um instante recente e ganhar a graça de uma
    # rotação legítima, o que ressuscitaria a sessão encerrada.
    if record.revoked:
        await revoke_all_refresh_tokens(record.user_id, db)
        await db.commit()
        return

    record.revoked = True
    await db.commit()


# --- Recuperação de senha (issue #36) ---------------------------------------
# Mesma forma dos refresh tokens acima, e de propósito: token opaco, só o
# sha256 no banco, uso único. O que muda é o prazo, muito mais curto, porque
# este chega por e-mail e caixa comprometida é o vetor que ele abre.

RESET_TTL = timedelta(minutes=settings.password_reset_expire_minutes)

# #130: janela em que reapresentar um refresh já rotacionado é tratado como
# resposta perdida (aba fechada em voo, conexão caída, 502 depois do commit)
# ou como duas abas restaurando juntas, e não como roubo. Maior que o timeout
# de 15 s do refresh no frontend, para o retry depois dele ainda caber aqui.
# Fora da janela, reuso continua derrubando todas as sessões.
ROTATION_REUSE_GRACE = timedelta(seconds=30)


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
    # #156: o refresh revogado abaixo não alcança o access token já emitido —
    # ele não passa pelo Postgres, só pela assinatura, e seguiria válido até
    # expirar sozinho (até 15min). Incrementar o epoch aqui, na MESMA
    # transação da troca de senha, fecha essa janela: o claim `ep` do token
    # antigo nunca mais bate com o que get_current_user lê da linha.
    # Expressão SQL (`User.token_epoch + 1`), não `+= 1` em Python: o UPDATE
    # soma no próprio banco, sem depender do valor que esta sessão carregava
    # na memória (que já é o mais atual aqui, mas manter os dois pontos do
    # bump — este e o de auth.py — na mesma forma evita um deles silenciosamente
    # virar uma corrida se algum dia deixar de ser o caso).
    user.token_epoch = User.token_epoch + 1

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
    await revoke_all_refresh_tokens(user.id, db)
    await db.commit()

    # A vítima de força bruta (check_throttle roda antes da senha na rota de
    # login, ver AGENTS.md) precisa de uma saída: redefinir a senha zera o
    # contador da conta, senão o 429 sobrevive à própria correção.
    await record_success(user.email, db)
    return True
