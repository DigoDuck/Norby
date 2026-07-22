from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.config import get_settings

settings = get_settings()

# Limiter compartilhado (chave padrão = IP do cliente). Importado pelo main e
# pelos routers. Rotas anônimas (login/register) usam esta chave padrão.
limiter = Limiter(key_func=get_remote_address)


def user_key(request: Request) -> str:
    """Chave de rate limit para rota AUTENTICADA: o id do usuário.

    Atrás do proxy do Railway o `get_remote_address` devolve o IP do próprio
    proxy para todo mundo (o uvicorn só honra X-Forwarded-For quando o peer é
    127.0.0.1), então limitar por IP colocaria todos os usuários no mesmo
    balde. Confiar no X-Forwarded-For resolveria isso mas tornaria a chave
    spoofável pelo cliente, o que é pior.

    O decorator do slowapi roda DEPOIS das dependências do FastAPI, então em
    rota autenticada o token lido aqui já foi validado pelo get_current_user.
    O fallback no IP cobre o caso de a rota ser usada sem token.
    """
    auth = request.headers.get("authorization", "")
    if auth[:7].lower() == "bearer ":
        try:
            payload = jwt.decode(
                auth[7:], settings.secret_key, algorithms=[settings.algorithm]
            )
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except JWTError:
            pass
    return get_remote_address(request)
