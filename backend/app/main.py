from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.routers import auth, wallets, transactions, ai, recurring, goals, dashboard
from app.config import get_settings
from app.limiter import limiter

settings = get_settings()

app = FastAPI(
    title="Norby API",
    description="Backend do Organizador Financeiro com IA",
    version="0.1.0",
)

# Rate limiting (anti brute-force). Respostas 429 passam pelo CORS normalmente.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list, # configurável via CORS_ORIGINS no .env
    allow_credentials=True, # Permite enviar cookies e headers de autenticação
    allow_methods=["*"],
    allow_headers=["*"], # Permite qualquer header
)

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