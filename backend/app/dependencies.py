import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from app.database import AsyncSessionLocal
from app.models.sql_models import User
from app.config import get_settings

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_db(): # Dependency
    # Sessão assíncrona do PostgreSQL
    async with AsyncSessionLocal() as session: # Cria sessão com banco
        try:
            yield session
        finally:
            await session.close()
            
async def get_current_user( # Autenticação
    token: str = Depends(oauth2_scheme), # Pega o token do header
    db: AsyncSession = Depends(get_db), # Injeta a sessão no banco
) -> User:
    # Valida o JWT e retorna o usuário autenticado
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode( # Validação do Token
            token,
            settings.secret_key,
            algorithms=[settings.algorithm]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        # Converte o sub p/ UUID aqui: um sub forjado/corrompido vira 401, não 500
        user_uuid = uuid.UUID(user_id)
    except (JWTError, ValueError, TypeError):
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_uuid)) # Buscca usuário no banco
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user