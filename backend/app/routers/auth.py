import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.dependencies import get_db, get_current_user
from app.limiter import limiter
from app.models.sql_models import User
from app.schemas.user import (
    UserRegister, UserLogin, UserUpdate, Token, TokenPair, RefreshRequest,
    DeleteAccountRequest, UserResponse,
)
from app.services.auth_service import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, rotate_refresh_token, revoke_refresh_token,
    _DUMMY_HASH,
)
from app.services.account_service import delete_account, export_data

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, payload: UserRegister, db: AsyncSession = Depends(get_db)): # Usa o pydantic dos schemas para validar email e senha
    # Verifica email duplicado
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    # bcrypt é CPU-bound e síncrono (~100-300ms). Rodar direto na rota async
    # travaria o event loop; offload para thread, como já é feito com o Gemini.
    password_hash = await asyncio.to_thread(hash_password, payload.password)
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=password_hash,
        privacy_accepted_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access = create_access_token(str(user.id))
    refresh = await create_refresh_token(str(user.id), db)
    return Token(access_token=access, refresh_token=refresh, user=UserResponse.model_validate(user))

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # bcrypt roda SEMPRE — contra o hash real ou contra o dummy. Sem isso, o
    # e-mail inexistente retorna ~200ms mais rápido e vira oráculo de enumeração.
    # verify_password é bloqueante → offload para thread.
    password_ok = await asyncio.to_thread(
        verify_password, payload.password, user.password_hash if user else _DUMMY_HASH
    )
    if not user or not password_ok:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    access = create_access_token(str(user.id))
    refresh = await create_refresh_token(str(user.id), db)
    return Token(access_token=access, refresh_token=refresh, user=UserResponse.model_validate(user))

@router.post("/refresh", response_model=TokenPair)
@limiter.limit("20/minute")
async def refresh_token(request: Request, payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    result = await rotate_refresh_token(payload.refresh_token, db)
    if result is None:
        raise HTTPException(status_code=401, detail="Refresh token inválido ou expirado")
    access, new_refresh, _user = result
    return TokenPair(access_token=access, refresh_token=new_refresh)

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
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
    data = payload.model_dump(exclude_unset=True)

    # Se o email mudar, garante que não está em uso por outro usuário
    new_email = data.get("email")
    if new_email and new_email != current_user.email:
        existing = await db.execute(select(User).where(User.email == new_email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email já cadastrado")

    for field, value in data.items():
        setattr(current_user, field, value)

    await db.commit()
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
@limiter.limit("3/minute")
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

    await delete_account(current_user, db)
