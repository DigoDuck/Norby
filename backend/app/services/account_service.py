"""Serviços de conta ligados à LGPD: exclusão total e exportação de dados.

O dado do usuário vive em dois lugares:
- PostgreSQL: user + wallets/transactions/recurring/goals/refresh_tokens
  (tudo com FK ondelete=CASCADE, então apagar o User remove o resto).
- MongoDB: ai_insights e chat_history, ligados por user_id (string). Não há
  cascade no Mongo — a remoção precisa ser explícita.
"""
import base64
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import ai_insights_collection, chat_history_collection
from app.models.sql_models import (
    User, Wallet, Transaction, RecurringTransaction, Goal,
)
from app.services.billing_service import cancel_subscription


def _row_to_dict(obj) -> dict:
    """Serializa uma linha do SQLAlchemy usando as colunas da tabela."""
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


async def _scoped(db: AsyncSession, model, user_id) -> list[dict]:
    result = await db.execute(select(model).where(model.user_id == user_id))
    return [_row_to_dict(row) for row in result.scalars().all()]


async def delete_account(user: User, db: AsyncSession) -> None:
    """Apaga DE VERDADE todos os dados do usuário (Stripe + Postgres + Mongo).

    Ordem: **Stripe primeiro**, e recusa dele aborta a exclusão INTEIRA; depois
    Mongo (sem cascade); Postgres por último (cascade cuida das tabelas filhas,
    incluindo refresh_tokens — sessões ficam invalidadas).

    A ordem vem da assimetria dos modos de falha, não de gosto: exclusão que
    falhou é recuperável, basta tentar de novo. Cartão sendo cobrado por uma
    conta que não existe mais NÃO é — vira chargeback e a pessoa não tem nem
    onde clicar para cancelar. A LGPD dá direito à exclusão, e uma falha
    temporária com mensagem honesta não fere isso; continuar cobrando em
    silêncio, sim.

    Levanta GatewayCancelFailed quando o Stripe recusa. Quem traduz para HTTP
    é o router.
    """
    if user.stripe_subscription_id:
        await cancel_subscription(user.stripe_subscription_id)

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

    # SELECT explícito: `photo` é deferido no modelo (para não vir junto em
    # toda requisição autenticada) e lê-lo pelo atributo dispararia lazy load,
    # que em sessão async estoura.
    foto = await db.scalar(select(User.photo).where(User.id == user.id))

    return {
        "exported_at": datetime.now(timezone.utc),
        "profile": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "created_at": user.created_at,
            # A foto é dado pessoal, e portabilidade que deixa dado de fora não
            # é portabilidade. Base64 porque o dump é JSON; são ~8 KB, o que
            # não muda o tamanho de um export de verdade.
            "photo_webp_base64": (
                base64.b64encode(foto).decode() if foto else None
            ),
        },
        "wallets": await _scoped(db, Wallet, user.id),
        "transactions": await _scoped(db, Transaction, user.id),
        "recurring_transactions": await _scoped(db, RecurringTransaction, user.id),
        "goals": await _scoped(db, Goal, user.id),
        "ai_insights": insights,
        "chat_history": chats,
    }
