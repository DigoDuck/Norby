import google.generativeai as genai
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import ai_insights_collection
from app.models.sql_models import Transaction, TransactionType
from app.services.goal_service import current_month_range
from app.config import get_settings
import asyncio
import json
import re
import logging

logger = logging.getLogger(__name__)

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
    
async def get_or_generate_insight(db: AsyncSession, user_id: str, month: int, year: int) -> dict:
    reference = f"{year}-{month:02d}"

    # Verifica cache
    cached = await ai_insights_collection.find_one(
        {"user_id": user_id, "reference_month": reference}
    )
    if cached:
        cached.pop("_id", None)
        return cached

    # Busca dados financeiros
    summary = await _get_user_financial_summary(db, user_id)

    # Chama o Gemini
    prompt = f"""
    Você é um consultor financeiro pessoal. Analise os dados abaixo e responda em português (pt-BR).
    Dados do usuário em {summary['month']}:
    - Receita total: R$ {summary['total_income']:.2f}
    - Despesas totais: R$ {summary['total_expenses']:.2f}
    - Saldo: R$ {summary['balance']:.2f}
    - Maiores categorias de gasto: {summary['top_categories']}
    
    responda APENAS em JSON com este formato (sem markdown):
    {{
        "score": <número de 0 a 100 representando saúde financeira>,
        "summary_text": "<3 insights curtos separados por | sobre o comportamento financeiro>",
        "suggested_action": "<uma sugestão prática e específica>"
    }}
    """
    
    # Chamada bloqueante do SDK -> offload p/ thread pra não travar o event loop
    response = await asyncio.to_thread(model.generate_content, prompt)

    # A IA pode devolver texto não-JSON, vazio ou ser bloqueada por safety filter.
    # Parsing isolado: se falhar, loga o texto cru e propaga pro router tratar.
    try:
        raw = response.text.strip()
        raw = re.sub(r"```json|```", "", raw).strip()  # Tira formatação markdown
        data = json.loads(raw)
        score = data["score"]
        summary_text = data["summary_text"]
        suggested_action = data["suggested_action"]
    except (AttributeError, ValueError, KeyError, TypeError) as e:
        raw_text = getattr(response, "text", None)
        logger.exception(
            "Resposta da IA inválida ao gerar insight (user=%s). Texto cru: %r",
            user_id, raw_text,
        )
        raise ValueError("Resposta da IA em formato inesperado") from e

    # Salva no cache do MongoDB
    insight = {
        "user_id": user_id,
        "reference_month": reference,
        "score": score,
        "summary_text": summary_text,
        "suggested_action": suggested_action,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await ai_insights_collection.insert_one(insight)
    insight.pop("_id", None)
    return insight

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
    for msg in history[-10:]: # Últimas 10 mensagens para não estourar contexto
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