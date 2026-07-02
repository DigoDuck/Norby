"""Manutenção one-off: remove insights de IA duplicados por
(user_id, reference_month) e cria um índice único que impede novas duplicatas.

Contexto: o insight do dashboard passou a usar upsert em (user_id,
reference_month), mas o código antigo fazia insert_one sem índice único, o que
permitiu duplicatas sob concorrência (duas cargas simultâneas do dashboard).
Este script limpa o passivo e blinda o futuro.

Idempotente — seguro rodar mais de uma vez. Rodar UMA vez por ambiente:
    docker exec norby_backend python scripts/dedupe_ai_insights.py   # dev
(em produção, rodar contra o Mongo do ambiente uma única vez.)
"""
import asyncio
import os
import sys
from collections import defaultdict

# Permite rodar o arquivo diretamente (python scripts/dedupe_ai_insights.py):
# garante que a raiz do backend (que contém o pacote `app`) esteja no path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import ai_insights_collection  # noqa: E402


async def main() -> None:
    groups: dict[tuple, list] = defaultdict(list)
    async for doc in ai_insights_collection.find({}):
        groups[(doc.get("user_id"), doc.get("reference_month"))].append(doc)

    removed = 0
    for docs in groups.values():
        if len(docs) <= 1:
            continue
        # Mantém o mais recente por generated_at (docs sem data vão pro fim).
        docs.sort(key=lambda d: d.get("generated_at") or "", reverse=True)
        for stale in docs[1:]:
            await ai_insights_collection.delete_one({"_id": stale["_id"]})
            removed += 1

    # Score nunca deve viver no cache (é sempre recalculado). Remove qualquer
    # score legado deixado pelo código antigo, para ninguém servir um valor velho.
    cleaned = await ai_insights_collection.update_many(
        {"score": {"$exists": True}}, {"$unset": {"score": ""}}
    )

    await ai_insights_collection.create_index(
        [("user_id", 1), ("reference_month", 1)],
        unique=True,
        name="uniq_user_month",
    )
    print(
        f"duplicados removidos: {removed}; scores legados limpos: "
        f"{cleaned.modified_count}; índice único 'uniq_user_month' garantido."
    )


if __name__ == "__main__":
    asyncio.run(main())
