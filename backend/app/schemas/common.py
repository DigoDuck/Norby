"""Tipos de campo reusados pelos schemas — os limites vêm das colunas do banco.

Definidos num lugar só para não repetir `Field(...)` em quatro arquivos e não
deixar um deles ficar para trás quando um limite mudar.
"""
from decimal import Decimal
from typing import Annotated

from pydantic import Field

# Maior valor que cabe em Numeric(15,2): 13 dígitos inteiros + 2 decimais.
MAX_MONEY = Decimal("9999999999999.99")

# Valor monetário estritamente positivo (o sinal vem do type INCOME/EXPENSE).
Money = Annotated[Decimal, Field(gt=0, le=MAX_MONEY, decimal_places=2)]

# Valor monetário que pode ser zero (saldo inicial, progresso de meta).
MoneyOrZero = Annotated[Decimal, Field(ge=0, le=MAX_MONEY, decimal_places=2)]

# Espelha String(100) das colunas name/category.
ShortText = Annotated[str, Field(min_length=1, max_length=100)]

# Espelha String(500) da coluna description.
LongText = Annotated[str, Field(max_length=500)]
