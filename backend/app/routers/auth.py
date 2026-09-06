import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.config import get_settings
from app.dependencies import get_db, get_current_user
from app.limiter import limiter, user_key, refresh_token_key, reset_email_key
from app.models.sql_models import User
from app.schemas.user import (
    UserRegister, UserLogin, UserUpdate, Token, TokenPair,
    DeleteAccountRequest, UserResponse, ForgotPassword, ResetPassword,
)
from app.services.auth_service import (
    hash_password, verify_password, verify_and_upgrade, create_access_token,
    create_refresh_token, rotate_refresh_token, revoke_refresh_token,
    create_password_reset, find_user_by_email, reset_password, _DUMMY_HASH,
)
from app.services.account_service import delete_account, export_data
from app.services.photo_service import MAX_BYTES, PhotoInvalid, PhotoTooLarge, processar_foto
from app.services.billing_service import GatewayCancelFailed
from app.services.email_service import (
    EmailFailed, EmailNotConfigured, enviar_email, html_recuperacao,
)
from app.services.plan_service import AI_TRIAL
from app.services.throttle_service import check_throttle, record_failure, record_success

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger("norby.auth")
settings = get_settings()


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


def _set_refresh_cookie(response: Response, raw: str) -> None:
    # HttpOnly tira o token do alcance de qualquer script na página; Path=/auth
    # mantém o cookie fora de todas as outras rotas. SameSite=Strict, e não
    # Lax: o Lax do Chrome ("Lax-allowing-unsafe") ainda manda o cookie num
    # POST cross-site de navegação de topo enquanto ele tem menos de 2 minutos
    # — e este cookie nunca é lido por uma navegação, só por XHR same-site
    # disparado pelo próprio norby.com.br. Strict cobre exatamente os mesmos
    # casos legítimos e fecha também essa janela de 2 minutos.
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="strict",
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.refresh_cookie_name,
        path="/auth",
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="strict",
    )


async def _refresh_body(request: Request) -> str:
    # Passo 3 de 3 do #110: só o cookie, o corpo não existe mais. Carimba em
    # request.state ANTES do decorator do slowapi rodar, porque
    # refresh_token_key é síncrono e não vê o corpo parseado.
    raw = request.cookies.get(settings.refresh_cookie_name)
    if not raw:
        raise HTTPException(status_code=401, detail="Refresh token ausente")
    request.state.refresh_token = raw
    return raw

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
# Teto global 60/min: só proteção contra flood, não é a defesa principal (ver
# check_throttle abaixo). Compartilha o balde por-conta do login: tentativas
# repetidas de "email já cadastrado" (enumeração aceita, ver AGENTS.md) agora
# também encostam na curva progressiva.
@limiter.limit("60/minute")
async def register(
    request: Request,
    response: Response,
    payload: UserRegister,
    db: AsyncSession = Depends(get_db),
    _xff: None = Depends(_log_xff),
): # Usa o pydantic dos schemas para validar email e senha
    retry_after = await check_throttle(payload.email, db)
    if retry_after is not None:
        raise _throttled(retry_after)

    # Verifica email duplicado. find_user_by_email compara por func.lower():
    # "Joao@x.com" e "joao@x.com" são a MESMA conta pro throttle (a chave HMAC
    # já normaliza caixa), então deixar a checagem sensível a caixa permitia
    # criar uma conta-sombra que, ao logar com sucesso, resetava o balde da
    # vítima (fix round 1, issue #22 — ver também o índice único funcional em
    # ix_users_email_lower).
    if await find_user_by_email(payload.email, db):
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
    _set_refresh_cookie(response, refresh)
    return Token(access_token=access, user=UserResponse.model_validate(user))

@router.post("/login", response_model=Token)
# Teto global 200/min: só flood. A defesa contra força bruta é o atraso
# progressivo por conta (HMAC do email) em check_throttle/record_failure —
# ver app/services/throttle_service.py e a issue #22.
@limiter.limit("200/minute")
async def login(
    request: Request,
    response: Response,
    payload: UserLogin,
    db: AsyncSession = Depends(get_db),
    _xff: None = Depends(_log_xff),
):
    retry_after = await check_throttle(payload.email, db)
    if retry_after is not None:
        raise _throttled(retry_after)

    # find_user_by_email compara por func.lower(): login precisa aceitar a
    # caixa que o usuário digitar, não só a caixa exata gravada no cadastro
    # (fix round 1, issue #22).
    user = await find_user_by_email(payload.email, db)

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
    _set_refresh_cookie(response, refresh)
    return Token(access_token=access, user=UserResponse.model_validate(user))

@router.post("/refresh", response_model=TokenPair)
# Issue #22: 20/min era teto de CAPACIDADE, não defesa — com access token de
# 15min, usuários ativos legítimos já esbarravam nele (~20/min só no pico de
# ~100 usuários). O que protege o refresh é o token opaco de 256 bits com
# rotação e detecção de reuso (auth_service.rotate_refresh_token), não o
# contador. 600/min fica só como flood protection.
@limiter.limit("600/minute")
async def refresh_token(
    request: Request,
    response: Response,
    raw: str = Depends(_refresh_body),
    db: AsyncSession = Depends(get_db),
    _xff: None = Depends(_log_xff),
):
    result = await rotate_refresh_token(raw, db)
    if result is None:
        raise HTTPException(status_code=401, detail="Refresh token inválido ou expirado")
    access, new_refresh, _user = result
    _set_refresh_cookie(response, new_refresh)
    return TokenPair(access_token=access)

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
    response: Response,
    raw: str = Depends(_refresh_body),
    db: AsyncSession = Depends(get_db),
    _xff: None = Depends(_log_xff),
):
    # Revoga o refresh recebido. Idempotente: token inexistente também retorna 204.
    await revoke_refresh_token(raw, db)
    _clear_refresh_cookie(response)

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


# --- Foto de perfil (issue #35) ----------------------------------------------


@router.put("/me/photo")
# Processar imagem custa CPU, ao contrário das outras escritas deste router.
# Chave por usuário porque atrás do proxy do Railway um teto por IP viraria um
# balde único para todo mundo (ver "Rate limit atrás do proxy" no AGENTS.md).
@limiter.limit("10/minute", key_func=user_key)
async def upload_my_photo(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recebe a imagem no corpo CRU, não em multipart.

    O teto precisa valer ANTES de o servidor materializar o arquivo, e o
    multipart do FastAPI só entrega o arquivo depois de já tê-lo despejado em
    disco. Mesmo desenho do webhook do Stripe, pelo mesmo motivo. De quebra,
    dispensa a dependência `python-multipart` e o frontend manda o File direto,
    sem montar FormData.

    O `Content-Type` declarado é ignorado de propósito: quem decide o formato é
    o conteúdo, lido pelo Pillow.
    """
    declarado = request.headers.get("content-length")
    if declarado and declarado.isdigit() and int(declarado) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="A imagem deve ter no máximo 2 MB")

    # A segunda checagem cobre quem omite o header ou mente nele, e o
    # `processar_foto` ainda repete o teto por ser função pública do service.
    corpo = b""
    async for pedaco in request.stream():
        corpo += pedaco
        if len(corpo) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="A imagem deve ter no máximo 2 MB")

    try:
        # Bloqueante (decodifica e reescala): vai para thread, como o bcrypt.
        current_user.photo = await asyncio.to_thread(processar_foto, corpo)
    except PhotoTooLarge as erro:
        raise HTTPException(status_code=413, detail=str(erro))
    except PhotoInvalid as erro:
        raise HTTPException(status_code=400, detail=str(erro))

    current_user.photo_updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"photo_updated_at": current_user.photo_updated_at}


@router.get("/me/photo")
async def get_my_photo(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rota FECHADA, com token.

    A tentação era abri-la, porque `<img src>` não manda header de autorização.
    Mas foto de perfil é dado pessoal, e o frontend baixa uma vez com o token e
    guarda como data URI — o que também evita mexer no `img-src` da CSP, que
    `blob:` exigiria.
    """
    if not current_user.photo_updated_at:
        raise HTTPException(status_code=404, detail="Sem foto de perfil")

    # ETag pela DATA, não por hash dos bytes: ela já está carregada e muda a
    # cada upload, que é exatamente quando o cache precisa cair. Hash exigiria
    # LER o blob para responder 304, que é justamente o que o 304 evita.
    # Microssegundos, não segundos: dois uploads no mesmo segundo gerariam o
    # mesmo ETag e a pessoa continuaria vendo a foto antiga (o teste pegou).
    etag = f'"{current_user.photo_updated_at.timestamp():.6f}"'
    if request.headers.get("if-none-match") == etag:
        # Sai ANTES de tocar no banco: o 304 é justamente a resposta que não
        # deve custar a leitura do blob.
        return Response(status_code=304, headers={"ETag": etag})

    # SELECT só da coluna. Ler `current_user.photo` seria um lazy load do
    # atributo deferido, e lazy load em sessão async estoura com MissingGreenlet
    # — o `deferred` que evita carregar o blob em toda requisição obriga a
    # buscá-lo explicitamente aqui.
    foto = await db.scalar(select(User.photo).where(User.id == current_user.id))
    if not foto:
        raise HTTPException(status_code=404, detail="Sem foto de perfil")

    return Response(
        content=foto,
        media_type="image/webp",
        headers={
            "ETag": etag,
            # `private`: é foto de UMA pessoa, nenhum proxy compartilhado pode
            # guardá-la. `must-revalidate` com max-age=0 troca o download por
            # um 304 vazio quando nada mudou.
            "Cache-Control": "private, max-age=0, must-revalidate",
        },
    )


@router.delete("/me/photo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_photo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Idempotente: apagar quem já não tem foto também devolve 204.
    current_user.photo = None
    current_user.photo_updated_at = None
    await db.commit()


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


# --- Recuperação de senha (issue #36) ---------------------------------------

ROTA_REDEFINIR = "/redefinir-senha"


async def _forgot_body(request: Request, payload: ForgotPassword) -> ForgotPassword:
    # Carimba o e-mail antes do decorator do slowapi rodar — mesmo truque do
    # _refresh_body, pelo mesmo motivo: o key_func é síncrono e não vê o corpo.
    request.state.reset_email = payload.email
    return payload


async def _mandar_link(email: str, link: str) -> None:
    """Roda DEPOIS da resposta, via BackgroundTasks. Não é otimização.

    Enviando dentro da requisição, e-mail existente levaria o tempo do POST ao
    Brevo e e-mail inexistente responderia na hora. Essa diferença é um oráculo
    de enumeração de conta tão bom quanto uma mensagem diferente — só que
    medido no relógio em vez de lido na tela. Respondendo antes de enviar, os
    dois casos custam o mesmo.
    """
    try:
        await enviar_email(
            para=email,
            assunto="Redefinir sua senha do Norby",
            html=html_recuperacao(link),
        )
    except (EmailFailed, EmailNotConfigured):
        # Já logado no service, e sem o endereço junto. Aqui não há para quem
        # reclamar: a resposta já foi entregue, e tem de ser a mesma sempre.
        pass


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
# Chave pelo e-mail, não pelo IP: atrás do proxy o balde por IP é compartilhado
# por todo mundo (ver "Rate limit atrás do proxy" no AGENTS.md), e o que este
# teto protege é a CAIXA DE ENTRADA do alvo. O segundo limite, por IP, é o
# freio de flood — um e-mail diferente a cada chamada nunca esgota o próprio
# balde, a mesma lição que o logout aprendeu no fix round 1. Issue #22: mesma
# dívida aceita do teto global de login, 200/min por ser o balde único do
# proxy do Railway.
@limiter.limit("200/minute")
@limiter.limit("3/hour", key_func=reset_email_key)
async def forgot_password(
    request: Request,
    background: BackgroundTasks,
    payload: ForgotPassword = Depends(_forgot_body),
    db: AsyncSession = Depends(get_db),
):
    """Sempre 202, exista o e-mail ou não.

    A resposta é idêntica de propósito: um 404 para e-mail desconhecido
    transformaria esta rota num verificador de quem tem conta no Norby, que é
    a mesma enumeração que o login evita com o `_DUMMY_HASH`.
    """
    if not get_settings().brevo_api_key:
        # Recuperação não provisionada. Recusar alto é melhor que responder 202
        # e nunca mandar nada: aqui não há atacante para proteger, há um dono
        # que precisa saber que a variável não existe.
        raise HTTPException(status_code=503, detail="Recuperação de senha indisponível")

    # find_user_by_email compara por func.lower(): sem isso, quem se cadastrou
    # como "Joao@x.com" e digita "joao@x.com" aqui não achava a conta e nunca
    # recebia o link (fix round 2, issue #22).
    user = await find_user_by_email(payload.email, db)
    if user is not None:
        raw = await create_password_reset(str(user.id), db)
        base = get_settings().app_base_url.rstrip("/")
        background.add_task(_mandar_link, user.email, f"{base}{ROTA_REDEFINIR}?token={raw}")

    return {"detail": "Se este e-mail tiver conta, o link de redefinição chegou nele."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
# Sem chave por e-mail aqui: quem apresenta o token não informa e-mail nenhum.
# Este teto NÃO protege o token — 48 bytes de entropia é que fazem isso, e não
# caem por tentativa. É só freio de flood no balde único do proxy do Railway
# (get_remote_address atrás dele devolve o mesmo IP pra todo mundo), a mesma
# dívida aceita do teto global de login (ver AGENTS.md).
@limiter.limit("200/minute")
async def reset_password_route(
    request: Request,
    payload: ResetPassword,
    db: AsyncSession = Depends(get_db),
):
    """Token inválido, expirado ou já usado respondem igual: 400.

    Distinguir "expirou" de "não existe" diria a quem tem um token roubado se
    ele um dia foi válido.
    """
    if not await reset_password(payload.token, payload.new_password, db):
        raise HTTPException(status_code=400, detail="Link inválido ou expirado")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
