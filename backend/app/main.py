import logging
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.routers import auth, wallets, transactions, ai, recurring, goals, dashboard, billing
from app.services.plan_service import PlanRefused
from app.services.wallet_service import WalletNotFound
from app.config import get_settings
from app.limiter import limiter

# --- Logging com request-id para correlacionar os logs de uma requisição ---
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s",
    force=True,  # garante nossa config mesmo quando o uvicorn já configurou o root
)
for _handler in logging.getLogger().handlers:
    _handler.addFilter(_RequestIdFilter())

logger = logging.getLogger("norby")

settings = get_settings()

# `None` remove a rota inteira, e não apenas a página: sem `openapi_url` não há
# schema para servir, então /docs e /redoc não teriam o que renderizar de todo
# jeito. Os três são explícitos porque um leitor futuro precisa ver que a
# decisão foi tomada, e não deduzir que o FastAPI cuidou disso sozinho.
_docs = settings.docs_enabled

app = FastAPI(
    title="Norby API",
    description="Backend do Organizador Financeiro com IA",
    version="0.1.0",
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)

# Rate limiting (anti brute-force). Respostas 429 passam pelo CORS normalmente.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ADR 0002: os services não conhecem HTTP (nenhum levanta HTTPException). Estes
# dois handlers são a única tradução, num lugar só — assim qualquer chamador
# futuro do wallet_service já recebe o status certo sem try/except por router.
@app.exception_handler(PlanRefused)
async def _plan_refused_handler(request: Request, exc: PlanRefused) -> JSONResponse:
    # `detail` em objeto de propósito: o frontend faz switch no `code`, que é
    # contrato e nunca é reescrito. Header próprio exigiria expose_headers no
    # CORS — a armadilha que este repo já pisou com o X-Total-Count.
    return JSONResponse(
        status_code=403, content={"detail": {"code": exc.code, "message": exc.message}}
    )


@app.exception_handler(WalletNotFound)
async def _wallet_not_found_handler(request: Request, exc: WalletNotFound) -> JSONResponse:
    # Inexistente e "de outro dono" respondem igual: distinguir viraria oráculo
    # de ids alheios.
    return JSONResponse(status_code=404, content={"detail": "Carteira não encontrada"})


# Request-id + captura de exceções não tratadas. Registrado ANTES do CORS para que
# o CORS fique por fora: assim o 500 gerado aqui ainda recebe os headers de CORS
# (senão o navegador mascara o erro real como falha de CORS).
@app.middleware("http")
async def request_context(request: Request, call_next):
    # response_headers foi registrado depois e fica por fora, então já gravou
    # o id antes desta camada rodar — o fallback anterior era inalcançável.
    rid = request.state.request_id
    token = request_id_ctx.set(rid)
    request.state.request_id = rid
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Erro não tratado")
        response = JSONResponse(
            status_code=500, content={"detail": "Erro interno do servidor"}
        )
    finally:
        request_id_ctx.reset(token)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list, # configurável via CORS_ORIGINS no .env
    allow_credentials=True, # Permite enviar cookies e headers de autenticação
    allow_methods=["*"],
    allow_headers=["*"], # Permite qualquer header
    # O navegador esconde headers de resposta que não estejam aqui. Sem esta
    # linha o X-Total-Count chega no wire e some antes do axios.
    expose_headers=["X-Total-Count"],
)


# Registrado depois do CORS para ficar na camada externa e alcançar também os
# preflights OPTIONS que o CORSMiddleware responde sem chamar request_context.
@app.middleware("http")
async def response_headers(request: Request, call_next):
    # Fatiado em 64: o valor vem do CLIENTE e vai para o log de toda
    # requisição. O parser de HTTP já barra quebra de linha, então o que sobra
    # é tamanho — sem teto, um header gordo infla o log a cada chamada.
    rid = (request.headers.get("X-Request-ID") or "")[:64] or uuid.uuid4().hex
    request.state.request_id = rid
    response = await call_next(request)

    response.headers["X-Request-ID"] = rid
    # Como a API pode devolver dados financeiros privados, no-store global evita
    # decisões frágeis rota a rota. Os demais headers independem do edge.
    # A CSP limita-se a frame-ancestors: uma política completa aqui quebraria o
    # Swagger UI em /docs e não acrescentaria proteção às respostas JSON.
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    return response

app.include_router(auth.router)
app.include_router(wallets.router)
app.include_router(transactions.router)
app.include_router(ai.router)
app.include_router(recurring.router)
app.include_router(goals.router)
app.include_router(dashboard.router)
app.include_router(billing.router)

@app.get("/health", tags=["Health"]) 
async def health_check():
    return {"status": "ok", "service": "Norby API"}
