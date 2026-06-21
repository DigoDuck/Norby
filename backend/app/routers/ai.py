from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from uuid import uuid4
from app.dependencies import get_current_user
from app.models.sql_models import User
from app.services.ai_service import get_or_generate_insight, chat_with_ai
from app.database import chat_history_collection

router = APIRouter(prefix="/ai", tags=["AI"])


class ChatMessage(BaseModel):
    message: str
    session_id: str | None = None
    
@router.get("/insight")
async def get_dashboard_insight(current_user: User = Depends(get_current_user)):
    try:
        now = datetime.now(timezone.utc)
        insight = await get_or_generate_insight(str(current_user.id), now.month, now.year)
        return insight
    except Exception as e:
        return {
            "score": None,
            "summary_text": "",
            "suggested_action": None,
            "error": "IA temporariamente indisponível"
        }
        
@router.post("/chat")
async def chat(payload: ChatMessage, current_user: User = Depends(get_current_user)): # Chat com o Gemini que lê os dados financeiros do usuário
    session_id = payload.session_id or str(uuid4())
    user_id = str(current_user.id)

    # Recupera histórico da sessão
    history_doc = await chat_history_collection.find_one(
        {"user_id": user_id, "session_id": session_id}
    )
    messages = history_doc["messages"] if history_doc else []
    
    # Adiciona mensagem do usuário
    user_msg = { "role": "user", "content": payload.message, "timestamp": datetime.now(timezone.utc).isoformat()}
    messages.append(user_msg)

    # Chama o Gemini
    ai_response = await chat_with_ai(user_id, payload.message, messages[:-1])

    # Resposta da IA
    ai_msg = {"role": "assistant", "content": ai_response, "timestamp": datetime.now(timezone.utc).isoformat()}
    messages.append(ai_msg)

    # Salva histórico no MongoDB
    await chat_history_collection.update_one(
        {"user_id": user_id, "session_id": session_id},
        {"$set": {"messages": messages, "update_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    return {"response": ai_response, "session_id": session_id}

@router.get("/chat/sessions")
async def list_sessions(current_user: User = Depends(get_current_user)): # Lista sessões de chat do usuário
    cursor = chat_history_collection.find(
        {"user_id": str(current_user.id)},
        {"session_id": 1, "update_at": 1, "messages": {"$slice": 1}},
    ).sort("update_at", -1).limit(20)
    
    sessions = []
    async for doc in cursor:
        sessions.append({
            "session_id": doc["session_id"],
            "update_at": doc.get("update_at"),
            "first_message": doc["messages"][0]["content"] if doc.get("messages") else "",
        })
    return sessions
        