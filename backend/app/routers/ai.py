from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db, get_current_user
from app.limiter import limiter
from app.models.sql_models import User
from app.services.ai_service import get_or_generate_insight, chat_with_ai
from app.schemas.ai import (
    InsightResponse,
    ChatResponse,
    ChatSessionSummary,
    ChatSessionDetail,
)
from app.database import chat_history_collection
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI"])

CHAT_SESSIONS_LIMIT = 20  # nº de sessões de chat recentes listadas


class ChatMessage(BaseModel):
    # Teto de tamanho: sem ele, uma mensagem enorme queima quota do Gemini,
    # CPU e espaço no Mongo. 4000 chars cobrem qualquer pergunta real.
    message: str = Field(min_length=1, max_length=4000)
    # UUID em vez de str: o tipo nativo já valida formato e tamanho, e o código
    # sempre gerou str(uuid4()) — o formato no Mongo não muda.
    session_id: UUID | None = None


@router.get("/insight", response_model=InsightResponse)
@limiter.limit("30/minute")
async def get_dashboard_insight(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        now = datetime.now(timezone.utc)
        insight = await get_or_generate_insight(db, str(current_user.id), now.month, now.year)
        return insight
    except Exception:
        # Widget opcional do dashboard: degrada com elegância em vez de derrubar a tela.
        # Status 200 proposital.
        logger.exception("Falha ao gerar insight do dashboard (user=%s)", current_user.id)
        return {
            "score": None,
            "summary_text": "",
            "suggested_action": None,
            "error": "IA temporariamente indisponível"
        }
        
@router.post(
    "/chat",
    response_model=ChatResponse,
    responses={503: {"description": "Norby AI temporariamente indisponível"}},
)
@limiter.limit("10/minute")
async def chat(
    request: Request,
    payload: ChatMessage,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
): # Chat com o Gemini que lê os dados financeiros do usuário
    session_id = str(payload.session_id) if payload.session_id else str(uuid4())
    user_id = str(current_user.id)

    # Recupera histórico da sessão (para dar contexto à IA)
    history_doc = await chat_history_collection.find_one(
        {"user_id": user_id, "session_id": session_id}
    )
    history = history_doc["messages"] if history_doc else []

    user_msg = {
        "role": "user",
        "content": payload.message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Chama o Gemini (se falhar, devolve 503 claro em vez de 500 sem headers de CORS)
    try:
        ai_response = await chat_with_ai(db, user_id, payload.message, history)
    except Exception:
        logger.exception("Falha no chat com a IA (user=%s)", user_id)
        raise HTTPException(
            status_code=503,
            detail="Norby AI está temporariamente indisponível. Tente novamente em instantes.",
        )

    ai_msg = {
        "role": "assistant",
        "content": ai_response,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # $push atômico: mensagens simultâneas não se sobrescrevem (sem last-write-wins).
    # $slice: -100 mantém só as 100 últimas — teto nativo do Mongo, sem job de limpeza.
    await chat_history_collection.update_one(
        {"user_id": user_id, "session_id": session_id},
        {
            "$push": {"messages": {"$each": [user_msg, ai_msg], "$slice": -100}},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )

    return {"response": ai_response, "session_id": session_id}

@router.get("/chat/sessions", response_model=list[ChatSessionSummary])
async def list_sessions(current_user: User = Depends(get_current_user)): # Lista sessões de chat do usuário
    cursor = chat_history_collection.find(
        {"user_id": str(current_user.id)},
        {"session_id": 1, "updated_at": 1, "messages": {"$slice": 1}},
    ).sort("updated_at", -1).limit(CHAT_SESSIONS_LIMIT)

    sessions = []
    async for doc in cursor:
        sessions.append({
            "session_id": doc["session_id"],
            "updated_at": doc.get("updated_at"),
            "first_message": doc["messages"][0]["content"] if doc.get("messages") else "",
        })
    return sessions


@router.get("/chat/sessions/{session_id}", response_model=ChatSessionDetail)
async def get_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
):  # Mensagens de uma sessão do próprio usuário
    doc = await chat_history_collection.find_one(
        {"user_id": str(current_user.id), "session_id": str(session_id)}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    # .get() defensivo: mensagens malformadas (sem content ou sem role) são ignoradas.
    messages = [
        {"role": m.get("role"), "content": m.get("content")}
        for m in doc.get("messages", [])
        if m.get("content") and m.get("role")
    ]
    return {"session_id": str(session_id), "messages": messages}
