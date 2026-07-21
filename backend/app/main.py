import logging
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.routers import auth, wallets, transactions, ai, recurring, goals, dashboard
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

app = FastAPI(
    title="Norby API",
    description="Backend do Organizador Financeiro com IA",
    version="0.1.0",
)

# Rate limiting (anti brute-force). Respostas 429 passam pelo CORS normalmente.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Request-id + captura de exceções não tratadas. Registrado ANTES do CORS para que
# o CORS fique por fora: assim o 500 gerado aqui ainda recebe os headers de CORS
# (senão o navegador mascara o erro real como falha de CORS).
@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = getattr(request.state, "request_id", None)
    if rid is None:
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
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
)


# Registrado depois do CORS para ficar na camada externa e alcançar também os
# preflights OPTIONS que o CORSMiddleware responde sem chamar request_context.
@app.middleware("http")
async def response_headers(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
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

@app.get("/health", tags=["Health"]) 
async def health_check():
    return {"status": "ok", "service": "Norby API"}
