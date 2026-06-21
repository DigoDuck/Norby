from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.dependencies import get_db, get_current_user
from app.limiter import limiter
from app.models.sql_models import User
from app.schemas.user import UserRegister, UserLogin, UserUpdate, Token, UserResponse
from app.services.auth_service import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, payload: UserRegister, db: AsyncSession = Depends(get_db)): # Usa o pydantic dos schemas para validar email e senha
    # Verifica email duplicado
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password)
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    token = create_access_token(str(user.id))
    return Token(access_token=token, user=UserResponse.model_validate(user))

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    token = create_access_token(str(user.id))
    return Token(access_token=token, user=UserResponse.model_validate(user))

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