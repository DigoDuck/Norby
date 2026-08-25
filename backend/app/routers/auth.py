import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.dependencies import get_db, get_current_user
from app.limiter import limiter, user_key, refresh_token_key
from app.models.sql_models import User
from app.schemas.user import (
    UserRegister, UserLogin, UserUpdate, Token, TokenPair, RefreshRequest,
    DeleteAccountRequest, UserResponse,
)
from app.services.auth_service import (
    hash_password, verify_password, verify_and_upgrade, create_access_token,
    create_refresh_token, rotate_refresh_token, revoke_refresh_token,
    _DUMMY_HASH,
)
from app.services.account_service import delete_account, export_data
from app.services.billing_service import GatewayCancelFailed
from app.services.plan_service import AI_TRIAL
from app.services.throttle_service import check_throttle, record_failure, record_success

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger("norby.auth")


def _throttled(retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Muitas tentativas. Tente novamente em instantes.",
        headers={"Retry-After": str(retry_after)},
    )


# Issue #22: Railway não documenta onde fica o IP real no X-Forwarded-For (o
# próprio suporte deles se contradiz), e a versão do uvicorn pinada aqui só
# aceita IP exato ou "*" (que usa o item mais à esquerda, controlado pelo
# cliente — inseguro). Em vez de confiar às cegas, logamos o header cru nas
# rotas de auth para decidir com dado, não com fórum. Temporário: remover
# depois de ler os logs de produção por algumas semanas.
def _log_xff(request: Request) -> None:
    logger.info(
        "auth xff=%r client=%s path=%s",
        request.headers.get("x-forwarded-for"),
        request.client.host if request.client else None,
        request.url.path,
    )

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
# Teto global 60/min: só proteção contra flood, não é a defesa principal (ver
# check_throttle abaixo). Compartilha o balde por-conta do login: tentativas
# repetidas de "email já cadastrado" (enumeração aceita, ver AGENTS.md) agora
# também encostam na curva progressiva.
@limiter.limit("60/minute")
async def register(
    request: Request,
    payload: UserRegister,
    db: AsyncSession = Depends(get_db),
    _xff: None = Depends(_log_xff),
): # Usa o pydantic dos schemas para validar email e senha
    retry_after = await check_throttle(payload.email, db)
    if retry_after is not None:
        raise _throttled(retry_after)

    # Verifica email duplicado. func.lower(): "Joao@x.com" e "joao@x.com" são
    # a MESMA conta pro throttle (a chave HMAC já normaliza caixa), então
    # deixar a checagem sensível a caixa permitia criar uma conta-sombra que,
    # ao logar com sucesso, resetava o balde da vítima (fix round 1, issue
    # #22 — ver também o índice único funcional em ix_users_email_lower).
    normalized_email = payload.email.strip().lower()
    existing = await db.execute(select(User).where(func.lower(User.email) == normalized_email))
    if existing.scalar_one_or_none():
        await record_failure(payload.email, db)
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    # bcrypt é CPU-bound e síncrono (~100-300ms). Rodar direto na rota async
    # travaria o event loop; offload para thread, como já é feito com o Gemini.
    password_hash = await asyncio.to_thread(hash_password, payload.password)
    # ADR 0001: o trial de IA é conceito do Norby, não Subscription do Stripe —
    # aquela alternativa criaria Customer e Subscription lá para TODO cadastro,
    # inclusive de quem nunca vai pagar, e acoplaria o registro a uma chamada
    # externa que pode falhar. Concede só IA: o teto de 2 carteiras continua
    # valendo durante o trial (premium_until segue NULL).
    agora = datetime.now(timezone.utc)
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=password_hash,
        privacy_accepted_at=agora,
        ai_trial_ends_at=agora + AI_TRIAL,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # Corrida: duas contas com o mesmo email em caixas diferentes
        # passaram no SELECT acima ao mesmo tempo. O índice único funcional
        # em lower(email) barra no banco; sem este catch, viraria 500.
        await db.rollback()
        await record_failure(payload.email, db)
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    await db.refresh(user)
    await record_success(payload.email, db)

    access = create_access_token(str(user.id))
    refresh = await create_refresh_token(str(user.id), db)
    return Token(access_token=access, refresh_token=refresh, user=UserResponse.model_validate(user))

@router.post("/login", response_model=Token)
# Teto global 200/min: só flood. A defesa contra força bruta é o atraso
# progressivo por conta (HMAC do email) em check_throttle/record_failure —
# ver app/services/throttle_service.py e a issue #22.
@limiter.limit("200/minute")
async def login(
    request: Request,
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
    _xff: None = Depends(_log_xff),
):
    retry_after = await check_throttle(payload.email, db)
    if retry_after is not None:
        raise _throttled(retry_after)

    # func.lower(): login precisa aceitar a caixa que o usuário digitar, não
    # só a caixa exata gravada no cadastro (fix round 1, issue #22).
    normalized_email = payload.email.strip().lower()
    result = await db.execute(select(User).where(func.lower(User.email) == normalized_email))
    user = result.scalar_one_or_none()

    # bcrypt roda SEMPRE — contra o hash real ou contra o dummy. Sem isso, o
    # e-mail inexistente retorna ~200ms mais rápido e vira oráculo de enumeração.
    # verify_and_upgrade é bloqueante e também produz o hash novo quando o
    # usuário ainda está no bcrypt legado.
    password_ok, upgraded_hash = await asyncio.to_thread(
        verify_and_upgrade,
        payload.password,
        user.password_hash if user else _DUMMY_HASH,
    )
    if not user or not password_ok:
        # Incrementa IDÊNTICO exista ou não o email — preserva o tempo
        # constante acima e impede que o throttle vire oráculo de enumeração.
        await record_failure(payload.email, db)
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    if upgraded_hash:
        user.password_hash = upgraded_hash
        await db.commit()
    await record_success(payload.email, db)

    access = create_access_token(str(user.id))
    refresh = await create_refresh_token(str(user.id), db)
    return Token(access_token=access, refresh_token=refresh, user=UserResponse.model_validate(user))

@router.post("/refresh", response_model=TokenPair)
# Issue #22: 20/min era teto de CAPACIDADE, não defesa — com access token de
# 15min, usuários ativos legítimos já esbarravam nele (~20/min só no pico de
# ~100 usuários). O que protege o refresh é o token opaco de 256 bits com
# rotação e detecção de reuso (auth_service.rotate_refresh_token), não o
# contador. 600/min fica só como flood protection.
@limiter.limit("600/minute")
async def refresh_token(
    request: Request,
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    _xff: None = Depends(_log_xff),
):
    result = await rotate_refresh_token(payload.refresh_token, db)
    if result is None:
        raise HTTPException(status_code=401, detail="Refresh token inválido ou expirado")
    access, new_refresh, _user = result
    return TokenPair(access_token=access, refresh_token=new_refresh)

async def _refresh_body(request: Request, payload: RefreshRequest) -> RefreshRequest:
    # Carimba o token em request.state ANTES do decorator do slowapi rodar,
    # pra refresh_token_key (limiter.py) conseguir ler: o key_func é síncrono
    # e só recebe `request`, sem acesso ao corpo já parseado pelo Pydantic.
    request.state.refresh_token = payload.refresh_token
    return payload

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
# Desde que o logout passou a derrubar TODAS as sessões ao receber um token já
# rotacionado, ele carrega o mesmo poder do /auth/refresh. Issue #22: a chave
# principal passou a ser o hash do token apresentado, não mais o IP (atrás do
# proxy o balde seria compartilhado por todo mundo, ver "Rate limit atrás do
# proxy" no AGENTS.md) — assim um token antigo da vítima não esgota o balde de
# outra sessão.
# Fix round 1: chavear só pelo token deixava o teto sem efeito nenhum contra
# flood — um token aleatório novo a cada chamada nunca esgota o PRÓPRIO balde.
# O segundo limite abaixo, por IP (chave padrão do slowapi), é o freio de
# flood de verdade; os dois ficam empilhados e qualquer um dos dois barra.
@limiter.limit("120/minute")
@limiter.limit("120/minute", key_func=refresh_token_key)
async def logout(
    request: Request,
    payload: RefreshRequest = Depends(_refresh_body),
    db: AsyncSession = Depends(get_db),
    _xff: None = Depends(_log_xff),
):
    # Revoga o refresh recebido. Idempotente: token inexistente também retorna 204.
    await revoke_refresh_token(payload.refresh_token, db)

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=UserResponse)
async def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # exclude_none: `null` explícito no corpo gravaria NULL em coluna NOT NULL.
    data = payload.model_dump(exclude_none=True)

    # Se o email mudar, garante que não está em uso por outro usuário.
    # func.lower() + exclusão do próprio id: fix round 1 (issue #22) — sem
    # isso, "Joao@x.com" e "joao@x.com" seriam contas diferentes (mesmo
    # problema do cadastro), e trocar só a caixa do próprio email bateria
    # falso-positivo contra si mesmo.
    new_email = data.get("email")
    if new_email and new_email != current_user.email:
        normalized_email = new_email.strip().lower()
        existing = await db.execute(
            select(User).where(
                func.lower(User.email) == normalized_email,
                User.id != current_user.id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email já cadastrado")

    for field, value in data.items():
        setattr(current_user, field, value)

    try:
        await db.commit()
    except IntegrityError:
        # Corrida equivalente à do cadastro: duas trocas de email pro mesmo
        # endereço (caixas diferentes) em paralelo. Índice único no banco
        # barra a segunda; sem o catch, viraria 500.
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    await db.refresh(current_user)
    return current_user

@router.get("/me/export")
async def export_my_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # LGPD: portabilidade. Baixa um JSON com todos os dados do usuário (PG + Mongo).
    data = await export_data(current_user, db)
    headers = {"Content-Disposition": 'attachment; filename="norby-meus-dados.json"'}
    return JSONResponse(content=jsonable_encoder(data), headers=headers)

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
# Atrás do proxy do Railway, limitar por IP criaria um único balde para todos
# os usuários. A chave autenticada impede que uma conta bloqueie as demais.
@limiter.limit("3/minute", key_func=user_key)
async def delete_my_account(
    request: Request,
    payload: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # LGPD: exclusão definitiva. Exige confirmação explícita no corpo.
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Confirmação obrigatória para excluir a conta")

    # bcrypt é bloqueante: executa em thread, como no login.
    password_ok = await asyncio.to_thread(
        verify_password, payload.password, current_user.password_hash
    )
    if not password_ok:
        raise HTTPException(status_code=401, detail="Senha incorreta")

    try:
        await delete_account(current_user, db)
    except GatewayCancelFailed as erro:
        # Assinatura viva e o Stripe recusou o cancelamento: NADA é apagado.
        # Falha de exclusão é recuperável (a pessoa tenta de novo); cartão
        # cobrado por conta inexistente não é.
        logger.error("falha ao cancelar assinatura no gateway: %s", erro)
        raise HTTPException(
            status_code=502,
            detail=(
                "Não foi possível cancelar sua assinatura agora, então nada foi "
                "excluído. Tente novamente em alguns minutos."
            ),
        )
