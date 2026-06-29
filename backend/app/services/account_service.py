"""Serviços de conta ligados à LGPD: exclusão total e exportação de dados.

O dado do usuário vive em dois lugares:
- PostgreSQL: user + wallets/transactions/recurring/goals/refresh_tokens
  (tudo com FK ondelete=CASCADE, então apagar o User remove o resto).
- MongoDB: ai_insights e chat_history, ligados por user_id (string). Não há
  cascade no Mongo — a remoção precisa ser explícita.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import ai_insights_collection, chat_history_collection
from app.models.sql_models import (
    User, Wallet, Transaction, RecurringTransaction, Goal,
)


def _row_to_dict(obj) -> dict:
    """Serializa uma linha do SQLAlchemy usando as colunas da tabela."""
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


async def _scoped(db: AsyncSession, model, user_id) -> list[dict]:
    result = await db.execute(select(model).where(model.user_id == user_id))
    return [_row_to_dict(row) for row in result.scalars().all()]


async def delete_account(user: User, db: AsyncSession) -> None:
    """Apaga DE VERDADE todos os dados do usuário (Postgres + Mongo).

    Ordem: Mongo primeiro (sem cascade), Postgres por último (cascade cuida das
    tabelas filhas, incluindo refresh_tokens — sessões ficam invalidadas).
    """
    user_id = str(user.id)
    await ai_insights_collection.delete_many({"user_id": user_id})
    await chat_history_collection.delete_many({"user_id": user_id})

    await db.delete(user)
    await db.commit()


async def export_data(user: User, db: AsyncSession) -> dict:
    """Monta um dump com todos os dados do usuário (direito de portabilidade)."""
    insights = []
    async for doc in ai_insights_collection.find({"user_id": str(user.id)}):
        doc["_id"] = str(doc["_id"])
        insights.append(doc)

    chats = []
    async for doc in chat_history_collection.find({"user_id": str(user.id)}):
        doc["_id"] = str(doc["_id"])
        chats.append(doc)

    return {
        "exported_at": datetime.now(timezone.utc),
        "profile": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "created_at": user.created_at,
        },
        "wallets": await _scoped(db, Wallet, user.id),
        "transactions": await _scoped(db, Transaction, user.id),
        "recurring_transactions": await _scoped(db, RecurringTransaction, user.id),
        "goals": await _scoped(db, Goal, user.id),
        "ai_insights": insights,
        "chat_history": chats,
    }
