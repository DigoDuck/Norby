import google.generativeai as genai
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import ai_insights_collection
from app.models.sql_models import Transaction, TransactionType
from app.services.goal_service import current_month_range
from app.services.score_service import compute_financial_score
from app.config import get_settings
import asyncio
import hashlib
import json
import re
import logging

logger = logging.getLogger(__name__)

# Nº de mensagens recentes enviadas como contexto ao Gemini (evita estourar o limite).
MAX_CHAT_HISTORY_MESSAGES = 10

settings = get_settings()
genai.configure(api_key=settings.gemini_api_key)
model = genai.GenerativeModel("models/gemini-2.5-flash")

async def _get_user_financial_summary(db: AsyncSession, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    # Range [início do mês, mês seguinte) como date — mesmo helper de goals,
    # indexável e sem cast de timezone (antes usava func.extract mês/ano).
    start, end = current_month_range(now)

    # Total de receitas no mês
    income_result = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.INCOME,
            Transaction.date >= start,
            Transaction.date < end,
        )
    )
    total_income = float(income_result.scalar() or 0)

    # Total de gastos no mês
    expense_result = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= start,
            Transaction.date < end,
        )
    )
    total_expenses = float(expense_result.scalar() or 0)

    # Top 5 categorias de despesas
    category_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(5)
    )
    categories = [{"category": r.category, "total": float(r.total)} for r in category_result]

    return {
        "month": now.strftime("%B %Y"),
        "total_income": total_income,
        "total_expenses": total_expenses,
        "balance": total_income - total_expenses,
        "top_categories": categories,
    }
    
def _summary_fingerprint(summary: dict) -> str:
    """Impressão digital dos dados que embasam o texto da IA.

    Se qualquer número/categoria muda, o fingerprint muda e o texto é
    regenerado — evita a 'Leitura da IA' congelada quando as transações do mês
    mudam, sem precisar chamar o Gemini a cada carga do dashboard.
    """
    payload = json.dumps(
        {
            "income": summary.get("total_income"),
            "expenses": summary.get("total_expenses"),
            "categories": summary.get("top_categories"),
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def get_or_generate_insight(db: AsyncSession, user_id: str, month: int, year: int) -> dict:
    reference = f"{year}-{month:02d}"

    # Score é sempre recalculado (determinístico) — nunca servido do cache,
    # para não congelar quando as transações do mês mudam.
    summary = await _get_user_financial_summary(db, user_id)
    score = compute_financial_score(summary)
    fingerprint = _summary_fingerprint(summary)

    # Texto (summary_text/suggested_action) é cacheado por mês, mas só
    # reaproveitado se os dados que o embasam não mudaram (fingerprint bate).
    # Assim a leitura nunca contradiz os números do dashboard.
    cached = await ai_insights_collection.find_one(
        {"user_id": user_id, "reference_month": reference}
    )
    if cached and cached.get("data_fingerprint") == fingerprint:
        cached.pop("_id", None)
        cached["score"] = score
        return cached

    # Chama o Gemini só para o texto (o número não vem mais do LLM).
    prompt = f"""
    Você é um consultor financeiro pessoal. Analise os dados abaixo e responda em português (pt-BR).
    Dados do usuário em {summary['month']}:
    - Receita total: R$ {summary['total_income']:.2f}
    - Despesas totais: R$ {summary['total_expenses']:.2f}
    - Saldo: R$ {summary['balance']:.2f}
    - Maiores categorias de gasto: {summary['top_categories']}

    responda APENAS em JSON com este formato (sem markdown):
    {{
        "summary_text": "<3 insights curtos separados por | sobre o comportamento financeiro>",
        "suggested_action": "<uma sugestão prática e específica>"
    }}
    """

    # A IA pode falhar na chamada (API/rede/quota) ou devolver texto não-JSON,
    # vazio ou bloqueado por safety filter — qualquer uma dessas falhas não
    # pode derrubar o score determinístico já calculado.
    response = None
    try:
        # Chamada bloqueante do SDK -> offload p/ thread pra não travar o event loop
        response = await asyncio.to_thread(model.generate_content, prompt)
        raw = response.text.strip()
        raw = re.sub(r"```json|```", "", raw).strip()  # Tira formatação markdown
        data = json.loads(raw)
        summary_text = data["summary_text"]
        suggested_action = data["suggested_action"]
    except Exception:
        raw_text = getattr(response, "text", None)
        logger.exception(
            "Resposta da IA inválida ao gerar insight (user=%s). Texto cru: %r",
            user_id, raw_text,
        )
        # O texto da IA falhou, mas o score é determinístico — devolve o score real.
        # Não cacheia (retorna sem passar por insert_one), para tentar de novo na próxima chamada.
        return {
            "score": score,
            "summary_text": "",
            "suggested_action": None,
            "error": "Não foi possível gerar a leitura da IA",
        }

    # Cacheia só o texto + o fingerprint dos dados (score fica fora do cache).
    # upsert em (user_id, reference_month) → sempre 1 doc por usuário/mês:
    # sobrescreve o texto velho e não cria duplicados sob concorrência.
    generated_at = datetime.now(timezone.utc).isoformat()
    await ai_insights_collection.update_one(
        {"user_id": user_id, "reference_month": reference},
        {
            "$set": {
                "user_id": user_id,
                "reference_month": reference,
                "summary_text": summary_text,
                "suggested_action": suggested_action,
                "data_fingerprint": fingerprint,
                "generated_at": generated_at,
            }
        },
        upsert=True,
    )
    return {
        "score": score,
        "summary_text": summary_text,
        "suggested_action": suggested_action,
        "generated_at": generated_at,
    }

async def chat_with_ai(db: AsyncSession, user_id: str, message: str, history: list) -> str:
    """ Chat contextualizado com dados financeiros do usuário """
    summary = await _get_user_financial_summary(db, user_id)

    system_context = f"""
    Você é o Norby, um assistente financeiro inteligente e amigável. Responda sempre em português (pt-BR).
    Contexto financeiro atual do usuário (mês {summary['month']}):
    - Receita: R$ {summary['total_income']:.2f}
    - Despesas: R$ {summary['total_expenses']:.2f}
    - Saldo: R$ {summary['balance']:.2f}
    - Top gastos: {summary['top_categories']}
    
    Seja direto, útil e use os dados para personalizar suas respostas.
    """
    
    # Monta histórico no formato do Gemini. Usa .get() porque um doc antigo ou
    # malformado no Mongo (sem role/content) não deve derrubar o chat inteiro.
    chat_history = []
    for msg in history[-MAX_CHAT_HISTORY_MESSAGES:]:
        content = msg.get("content")
        if not content:
            continue
        role = "user" if msg.get("role") == "user" else "model"
        chat_history.append({"role": role, "parts": [content]})
        
    chat = model.start_chat(history=chat_history)
    # Chamada bloqueante do SDK -> offload p/ thread
    response = await asyncio.to_thread(
        chat.send_message, f"{system_context}\n\nUsuário: {message}"
    )
    return response.text