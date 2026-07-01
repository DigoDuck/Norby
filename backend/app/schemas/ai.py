from datetime import datetime

from pydantic import BaseModel


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
