"""Transferência entre carteiras: move saldo sem ser receita nem despesa.

Paywall (ADR 0002): o DESTINO é escrita e respeita o teto; a ORIGEM pode estar
bloqueada, porque tirar valor dela é drenar. Desfazer (excluir) é sempre
permitido, como excluir transação.
"""
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sql_models import Transfer, User, Wallet
from app.schemas.transfer import TransferCreate
from app.services.wallet_service import get_owned_wallet


def lock_order(a: UUID, b: UUID) -> list[UUID]:
    """Ordem fixa de travamento. A→B e B→A simultâneas travando em ordens
    opostas dariam deadlock; ordenar por id faz as duas esperarem na mesma fila."""
    return sorted([a, b])


async def _travar(
    db: AsyncSession, user: User, origem_id: UUID, destino_id: UUID, *, checar_teto: bool
) -> tuple[Wallet, Wallet]:
    carteiras = {}
    for wallet_id in lock_order(origem_id, destino_id):
        carteiras[wallet_id] = await get_owned_wallet(
            wallet_id,
            user,
            db,
            for_update=True,
            for_write=checar_teto and wallet_id == destino_id,
        )
    return carteiras[origem_id], carteiras[destino_id]


async def create_transfer(db: AsyncSession, user: User, payload: TransferCreate) -> Transfer:
    origem, destino = await _travar(
        db, user, payload.from_wallet_id, payload.to_wallet_id, checar_teto=True
    )
    origem.balance -= payload.amount
    destino.balance += payload.amount

    transfer = Transfer(user_id=user.id, **payload.model_dump())
    db.add(transfer)
    await db.commit()
    await db.refresh(transfer)
    return transfer


async def delete_transfer(db: AsyncSession, user: User, transfer: Transfer) -> None:
    origem, destino = await _travar(
        db, user, transfer.from_wallet_id, transfer.to_wallet_id, checar_teto=False
    )
    origem.balance += transfer.amount
    destino.balance -= transfer.amount

    await db.delete(transfer)
    await db.commit()
