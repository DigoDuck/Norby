from datetime import datetime

from uuid import UUID

from pydantic import BaseModel, Field


class InsightResponse(BaseModel):
    # score/summary_text/suggested_action no caminho normal; error preenchido
    # apenas na degradação graciosa (IA indisponível). response_model também
    # filtra os campos internos do doc cacheado (user_id, reference_month, etc.).
    score: float | None = None
    summary_text: str = ""
    suggested_action: str | None = None
    error: str | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str


class ChatSessionSummary(BaseModel):
    session_id: str
    updated_at: datetime | None = None
    first_message: str = ""


class ChatMessageOut(BaseModel):
    role: str
    content: str


class ChatSessionDetail(BaseModel):
    session_id: str
    messages: list[ChatMessageOut]


class ChatMessage(BaseModel):
    # Teto de tamanho: sem ele, uma mensagem enorme queima quota do Gemini,
    # CPU e espaço no Mongo. 4000 chars cobrem qualquer pergunta real.
    message: str = Field(min_length=1, max_length=4000)
    # UUID em vez de str: o tipo nativo já valida formato e tamanho, e o código
    # sempre gerou str(uuid4()) — o formato no Mongo não muda.
    session_id: UUID | None = None
