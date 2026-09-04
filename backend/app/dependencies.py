import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from app.database import AsyncSessionLocal
from app.models.sql_models import User
from app.services.plan_service import PlanRefused, ai_gate_open
from app.config import get_settings

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_db(): # Dependency
    # Sessão assíncrona do PostgreSQL
    # O `async with` já fecha a sessão na saída — o try/finally anterior
    # sugeria um cuidado extra que não existia.
    async with AsyncSessionLocal() as session:
        yield session
            
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

    result = await db.execute(select(User).where(User.id == user_uuid)) # Busca usuário no banco
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

async def require_ai_access(current_user: User = Depends(get_current_user)) -> User:
    """Portão da IA (ADR 0002). Substitui o `get_current_user` nas rotas que GERAM.

    Dependency, e não checagem dentro da rota, por dois motivos. O primeiro é de
    desenho: a checagem só precisa do usuário, que é o que dependency faz bem, e
    é onde este app já coloca autorização. O segundo é concreto e vale registrar
    — o `/ai/insight` embrulha o corpo inteiro num `except Exception` que degrada
    para 200 com "IA temporariamente indisponível". Uma recusa levantada lá
    dentro seria ENGOLIDA e o usuário free veria um erro de indisponibilidade em
    vez do motivo real. Dependency roda antes do corpo, então escapa disso.

    Dentro do `ai_service` também não: o service passaria a conhecer plano, e
    qualquer chamador futuro que não passe por aquela função fura o portão sem
    ninguém notar.
    """
    if not ai_gate_open(current_user):
        raise PlanRefused(
            "AI_REQUIRES_PREMIUM",
            "A IA do Norby faz parte do plano pago. Seus dados e seu histórico "
            "continuam aqui.",
        )
    return current_user
