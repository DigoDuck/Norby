"""Regra de saldo das transações, centralizada.

O efeito de uma transação no saldo da carteira (INCOME soma, EXPENSE subtrai) é
a regra de negócio central do app. Ela aparecia duplicada em create/update/delete
no router e na materialização de recorrências. Aqui vive em um único lugar.
"""
from decimal import Decimal

from app.models.sql_models import TransactionType, Wallet


def signed_delta(type_: TransactionType, amount: Decimal) -> Decimal:
    """Delta com sinal: positivo para INCOME, negativo para EXPENSE."""
    return amount if type_ == TransactionType.INCOME else -amount


def apply_delta(wallet: Wallet, type_: TransactionType, amount: Decimal) -> None:
    """Aplica o efeito da transação no saldo da carteira."""
    wallet.balance += signed_delta(type_, amount)


def revert_delta(wallet: Wallet, type_: TransactionType, amount: Decimal) -> None:
    """Desfaz o efeito de uma transação já aplicada no saldo."""
    wallet.balance -= signed_delta(type_, amount)
