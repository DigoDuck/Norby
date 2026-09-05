"""Tipos de campo reusados pelos schemas — os limites vêm das colunas do banco.

Definidos num lugar só para não repetir `Field(...)` em quatro arquivos e não
deixar um deles ficar para trás quando um limite mudar.
"""
import re
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, Field

# Maior valor que cabe em Numeric(15,2): 13 dígitos inteiros + 2 decimais.
MAX_MONEY = Decimal("9999999999999.99")

# Valor monetário estritamente positivo (o sinal vem do type INCOME/EXPENSE).
Money = Annotated[Decimal, Field(gt=0, le=MAX_MONEY, decimal_places=2)]

# Valor monetário que pode ser zero (saldo inicial, progresso de meta).
MoneyOrZero = Annotated[Decimal, Field(ge=0, le=MAX_MONEY, decimal_places=2)]

# Espelha String(100) das colunas name/category.
ShortText = Annotated[str, Field(min_length=1, max_length=100)]

# Nome de pessoa: mesma coluna de 100, mas piso de 2 caracteres. Tipo próprio
# em vez de ShortText porque cadastro e atualização precisam concordar — com
# ShortText no update, um nome de 1 caractere entrava por lá e contornava a
# regra que o cadastro aplica.
PersonName = Annotated[str, Field(min_length=2, max_length=100)]

# Espelha String(500) da coluna description.
LongText = Annotated[str, Field(max_length=500)]

# Slug do banco escolhido para a carteira (issue #34). O catalogo de bancos vive
# no FRONTEND, porque marca e cor sao apresentacao: manter a lista aqui exigiria
# deploy do backend para acrescentar um banco, e o backend nao tem opiniao sobre
# quais existem. O que ele garante e que o valor e um token curto e seguro.
BankSlug = Annotated[str, Field(min_length=1, max_length=20, pattern=r"^[a-z0-9-]+$")]

def _senha_aceitavel(v: str) -> str:
    # Regra mínima: pelo menos uma letra e um número (o min_length já garante 8+).
    if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError(
            "A senha deve ter ao menos 8 caracteres, incluindo uma letra e um número"
        )
    # O bcrypt trunca em 72 BYTES e ignora o resto sem avisar. O max_length do
    # Field conta caracteres, e um acento ocupa mais de um byte.
    if len(v.encode("utf-8")) > 72:
        raise ValueError("A senha deve ter no máximo 72 bytes (acentos contam 2)")
    return v


# Senha nova, no cadastro E na recuperação (#36). Tipo compartilhado de
# propósito: com as regras copiadas em dois schemas, a redefinição acabaria
# aceitando uma senha que o cadastro recusa, e ninguém notaria — o caminho que
# valida menos é justamente o que um atacante escolhe.
StrongPassword = Annotated[str, Field(min_length=8, max_length=128), AfterValidator(_senha_aceitavel)]
