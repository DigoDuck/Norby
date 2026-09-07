from fastapi import APIRouter, Depends, Query, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, or_, select
from uuid import UUID
from datetime import date
from typing import Optional
from app.dependencies import get_db, get_current_user
from app.models.sql_models import User, Transaction, TransactionType, Wallet
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionResponse
from app.services.transaction_service import apply_delta, revert_delta
from app.services.wallet_service import get_owned_wallet
from app.services.goal_service import current_month_range

router = APIRouter(prefix="/transactions", tags=["Transactions"])


# Busca sem acento e sem caixa, do lado do banco (issue #24).
#
# `translate` em vez da extensão `unaccent` por três motivos: não exige
# CREATE EXTENSION, que o Neon pode recusar e derrubaria o deploy; é
# IMMUTABLE, então um índice funcional em cima dela é possível no dia em que
# o volume pedir (a `unaccent` é STABLE e precisaria de um invólucro); e o
# conjunto de caracteres do pt-BR cabe numa constante. As duas strings TÊM
# que ter o mesmo comprimento.
_ACENTOS = "áàâãäéèêëíìîïóòôõöúùûüç"
_SEM_ACENTO = "aaaaaeeeeiiiiooooouuuuc"
_TABELA = str.maketrans(_ACENTOS, _SEM_ACENTO)


def normalizar(texto: str) -> str:
    """Mesma normalização do lado do Python, para o termo buscado."""
    return texto.lower().translate(_TABELA)


def _escapar_like(texto: str) -> str:
    """`%` e `_` são curingas do LIKE. Sem escapar, buscar `%` casa com TUDO —
    um 'listar tudo' disfarçado de busca."""
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _sem_acento(coluna):
    return func.translate(func.lower(coluna), _ACENTOS, _SEM_ACENTO)


# ponytail: locks são adquiridos na ordem transação → carteira antiga → carteira
# nova. Duas transações DIFERENTES trocando as mesmas duas carteiras em sentidos
# opostos ainda podem deadlockar (o Postgres detecta e aborta uma, virando 500).
# O mesmo ciclo alcança `materialize_due_recurring` (services/recurring_service.py),
# que desde 2026-08-15 também trava carteiras, na ordem em que os templates saem
# do SELECT: um /recurring/run segurando a carteira A e querendo a B fecha o ciclo
# com um update movendo transação de B para A.
# Se isso aparecer em produção, ordenar os locks de carteira por UUID nos DOIS
# caminhos — ordenar só aqui não desfaz o ciclo.
async def _get_owned_transaction(transaction_id: UUID, user: User, db: AsyncSession) -> Transaction:
    """Transação do usuário, sempre com lock (FOR UPDATE).

    Os dois únicos chamadores (update/delete) mutam saldo de carteira a partir
    dos valores ANTIGOS desta linha. Sem o lock, duas requisições concorrentes
    leem o mesmo valor antigo e o revertem duas vezes da carteira — o saldo
    deixa de bater com a transação gravada. Com o lock, a segunda só lê depois
    do commit da primeira e enxerga o valor já atualizado.
    """
    stmt = (
        select(Transaction)
        .where(
            Transaction.id == transaction_id,
            Transaction.user_id == user.id,
        )
        .with_for_update()
    )
    transaction = (await db.execute(stmt)).scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    return transaction


@router.get("/", response_model=list[TransactionResponse])
async def list_transactions(
    category: Optional[str] = Query(None),
    type: Optional[TransactionType] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    # Faixa obrigatória: sem ela, date(year, month, 1) levanta ValueError para
    # ano fora do suportado e o erro vira 500 no handler global.
    year: Optional[int] = Query(None, ge=1900, le=2100),
    q: Optional[str] = Query(None, max_length=100),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    response: Response = None,
):
    filters = [Transaction.user_id == current_user.id]

    if category:
        filters.append(Transaction.category.ilike(f"%{category}%"))
    if q:
        # Descrição é nula em muita transação: `translate(NULL)` é NULL e NULL
        # LIKE nunca é verdadeiro, então o `or_` resolve sozinho, sem coalesce.
        alvo = f"%{_escapar_like(normalizar(q))}%"
        filters.append(
            or_(
                _sem_acento(Transaction.description).like(alvo, escape="\\"),
                _sem_acento(Transaction.category).like(alvo, escape="\\"),
            )
        )
    if type:
        filters.append(Transaction.type == type)
    # month e year andam juntos. Aceitar um sozinho devolvia 200 com o filtro
    # silenciosamente ignorado: o cliente pedia junho e recebia o histórico
    # inteiro achando que era junho.
    if (month is None) != (year is None):
        raise HTTPException(
            status_code=422, detail="Informe month e year juntos, ou nenhum dos dois"
        )
    if month and year:
        # Intervalo [início do mês, início do mês seguinte) — helper único, correto p/ dezembro
        start, end = current_month_range(date(year, month, 1))
        filters.append(Transaction.date >= start)
        filters.append(Transaction.date < end)

    # Contagem com os MESMOS filtros e sem limit/offset: é o que permite a UI
    # dizer "página 2 de 7". Sem isso o front mostra 200 linhas e cala sobre o resto.
    total = (
        await db.execute(select(func.count()).select_from(Transaction).where(*filters))
    ).scalar_one()
    response.headers["X-Total-Count"] = str(total)

    result = await db.execute(
        select(Transaction)
        .where(*filters)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    payload: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wallet = await get_owned_wallet(
        payload.wallet_id, current_user, db, for_update=True, for_write=True
    )
    apply_delta(wallet, payload.type, payload.amount)

    transaction = Transaction(user_id=current_user.id, **payload.model_dump())
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.put("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: UUID,
    payload: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    transaction = await _get_owned_transaction(transaction_id, current_user, db)

    # exclude_none, não exclude_unset: um `null` explícito no corpo conta como
    # "set", então passava pelo filtro e era gravado numa coluna NOT NULL,
    # virando IntegrityError e 500. O único campo legitimamente anulável é
    # description, e string vazia continua limpando ele.
    data = payload.model_dump(exclude_none=True)

    # Valores finais: o que veio no payload sobrescreve o atual
    new_wallet_id = data.get("wallet_id", transaction.wallet_id)
    new_type = data.get("type", transaction.type)
    new_amount = data.get("amount", transaction.amount)

    # Carteira de origem (onde o efeito antigo está aplicado). Tolerante a None:
    # preserva o comportamento defensivo anterior.
    #
    # `for_write` depende de a transação FICAR ou SAIR (ADR 0002): continuar numa
    # carteira bloqueada é escrever nela, e é recusado; sair dela é drenar, e é
    # permitido. Sem essa saída, quem virou free escolheria entre pagar e
    # destruir histórico, já que excluir carteira apaga as transações por cascade.
    mesma_carteira = new_wallet_id == transaction.wallet_id
    old_wallet = await get_owned_wallet(
        transaction.wallet_id,
        current_user,
        db,
        for_update=True,
        required=False,
        for_write=mesma_carteira,
    )

    # Carteira de destino (pode ser a mesma). Destino é SEMPRE escrita.
    if mesma_carteira:
        new_wallet = old_wallet
    else:
        new_wallet = await get_owned_wallet(
            new_wallet_id, current_user, db, for_update=True, for_write=True
        )

    # 1) Reverte o efeito antigo (usa os valores AINDA não alterados da transação)
    if old_wallet:
        revert_delta(old_wallet, transaction.type, transaction.amount)

    # 2) Aplica o efeito novo na carteira de destino
    if new_wallet:
        apply_delta(new_wallet, new_type, new_amount)

    # 3) Atualiza os campos da transação
    for field, value in data.items():
        setattr(transaction, field, value)

    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    transaction = await _get_owned_transaction(transaction_id, current_user, db)

    # Sem for_write: apagar transação de dentro de carteira bloqueada drena, e
    # drenar é permitido (ADR 0002).
    wallet = await get_owned_wallet(
        transaction.wallet_id, current_user, db, for_update=True, required=False
    )
    if wallet:
        revert_delta(wallet, transaction.type, transaction.amount)

    await db.delete(transaction)
    await db.commit()
