"""Aplicação dos eventos de assinatura do Stripe (issue #45, ADR 0001).

O que o Stripe manda vira colunas em `users`. Nada aqui autoriza: quem autoriza
é `plan_service`, lendo `premium_until`.

Recebe **dict puro**, nunca `StripeObject`: o SDK para no router, no papel de
verificador de assinatura. É isso que mantém a troca de gateway sendo um dos
quatro pontos de acoplamento que o ADR nomeia.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

import stripe

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.sql_models import StripeWebhookEvent, User

logger = logging.getLogger("norby.billing")

# `created` entrou junto do `updated` depois que a implementação mostrou o furo:
# o `checkout.session.completed` NÃO traz `current_period_end`, e quem carrega o
# período da PRIMEIRA assinatura é o `created`. Sem ele, o premium_until da
# primeira compra só chegaria na primeira renovação. Mesmo handler para os três:
# todos trazem o objeto completo da assinatura.
EVENTOS_ASSINATURA = frozenset(
    {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }
)
EVENTO_CHECKOUT = "checkout.session.completed"


def _instante(epoch: int | None) -> datetime | None:
    return datetime.fromtimestamp(epoch, timezone.utc) if epoch else None


def _chave() -> str:
    """A chave secreta, lida a cada chamada e não no import.

    Nada no app configurava `stripe.api_key`: ele estava `None`, então a
    primeira chamada real ao gateway falharia por autenticação. Isso já valia
    para o `cancel_subscription` — quem tivesse assinatura não conseguiria
    excluir a conta, porque a recusa do gateway ABORTA a exclusão de propósito.
    """
    return get_settings().stripe_secret_key


def _periodo_fim(obj: dict) -> datetime | None:
    """Até quando está pago.

    O campo SAIU do topo da assinatura: na versão de API que o SDK 15 fixa
    (2026-07-29.dahlia) `current_period_end` mora em cada ITEM. Ler só o topo
    devolveria None e apagaria o `premium_until` de quem paga — o portão
    inteiro do ADR 0001. O topo vem primeiro porque conta com versão antiga
    fixada no endpoint ainda manda ali, e `max` porque assinatura com vários
    itens (que a nossa não tem) está paga até o item que vai mais longe.
    """
    topo = obj.get("current_period_end")
    if topo:
        return _instante(topo)
    fins = [
        item.get("current_period_end")
        for item in ((obj.get("items") or {}).get("data") or [])
        if item.get("current_period_end")
    ]
    return _instante(max(fins)) if fins else None


def _projecao(evento: dict) -> dict:
    """Só os campos que este handler lê — nunca o payload cru.

    O `checkout.session.completed` traz `customer_details.email`; guardar o
    evento inteiro colocaria PII fora do alcance do `delete_account`.
    """
    obj = evento.get("data", {}).get("object", {}) or {}
    tipo = evento.get("type", "")
    return {
        "event_id": evento["id"],
        "type": tipo,
        "stripe_created": _instante(evento.get("created")),
        "customer_id": obj.get("customer"),
        "subscription_id": obj.get("subscription") if tipo == EVENTO_CHECKOUT else obj.get("id"),
        "current_period_end": _periodo_fim(obj),
        "status": obj.get("status"),
        "cancel_at_period_end": obj.get("cancel_at_period_end"),
        "received_at": datetime.now(timezone.utc),
    }


async def _registrar(dados: dict, db: AsyncSession) -> bool:
    """Grava o evento. False quando já existe — reentrega do Stripe.

    Upsert atômico em vez de SELECT-depois-INSERT: o Stripe pode entregar a
    mesma reentrega duas vezes em paralelo, e o read-modify-write deixaria as
    duas passarem pelo SELECT e a segunda estourar a PK como IntegrityError.
    """
    inserido = await db.scalar(
        pg_insert(StripeWebhookEvent)
        .values(**dados)
        .on_conflict_do_nothing(index_elements=[StripeWebhookEvent.event_id])
        .returning(StripeWebhookEvent.event_id)
    )
    return inserido is not None


async def _dono(evento: dict, dados: dict, db: AsyncSession) -> User | None:
    """Acha o usuário do evento.

    O checkout casa por `client_reference_id` (o id do usuário, carimbado por
    nós na criação da sessão) porque é a ÚNICA vez que o Stripe ainda não sabe
    quem é a pessoa. Dali em diante casa por `stripe_customer_id`.
    """
    if evento.get("type") == EVENTO_CHECKOUT:
        referencia = (evento.get("data", {}).get("object", {}) or {}).get("client_reference_id")
        try:
            user_id = uuid.UUID(str(referencia))
        except (ValueError, TypeError):
            return None
        return await db.scalar(select(User).where(User.id == user_id))

    if not dados["customer_id"]:
        return None
    return await db.scalar(
        select(User).where(User.stripe_customer_id == dados["customer_id"])
    )


def _aplicar(user: User, evento: dict, dados: dict) -> None:
    if evento["type"] == EVENTO_CHECKOUT:
        # O checkout só AMARRA os ids: ele não traz período nenhum. Quem move o
        # portão é o customer.subscription.created que vem junto.
        user.stripe_customer_id = dados["customer_id"] or user.stripe_customer_id
        user.stripe_subscription_id = dados["subscription_id"] or user.stripe_subscription_id
        return

    user.stripe_subscription_id = dados["subscription_id"]
    user.subscription_status = dados["status"]
    user.cancel_at_period_end = bool(dados["cancel_at_period_end"])

    if evento["type"] == "customer.subscription.deleted":
        # `ended_at` é quando a assinatura REALMENTE acabou. Num cancelamento
        # imediato ele é agora, enquanto `current_period_end` ainda aponta para
        # o futuro — usar o período aqui deixaria acesso pago em pé depois do
        # fim. Cai para o período quando o Stripe omite o ended_at.
        fim = (evento.get("data", {}).get("object", {}) or {}).get("ended_at")
        user.premium_until = _instante(fim) or dados["current_period_end"]
        return

    user.premium_until = dados["current_period_end"]


async def handle_event(evento: dict, db: AsyncSession) -> None:
    """Idempotente, tolerante a chegada fora de ordem, e nunca levanta por
    evento que não interessa. Quem não é tratado ainda assim fica gravado."""
    dados = _projecao(evento)

    if not await _registrar(dados, db):
        logger.info("stripe: evento %s reentregue, ignorado", dados["event_id"])
        await db.rollback()
        return

    tipo = evento.get("type")
    if tipo not in EVENTOS_ASSINATURA and tipo != EVENTO_CHECKOUT:
        # Assinamos só quatro tipos no painel, mas alguém pode ligar outro sem
        # avisar. Gravado e não processado, em vez de 500 e reentrega por 3 dias.
        await db.commit()
        return

    user = await _dono(evento, dados, db)
    if user is None:
        # processed_at fica NULO: é a trilha de auditoria de "não casou com
        # ninguém" (`WHERE processed_at IS NULL`). Responder não-2xx faria o
        # Stripe reentregar por 3 dias um evento que nunca vai casar.
        logger.warning(
            "stripe: evento %s (%s) sem usuário correspondente, customer=%s",
            dados["event_id"], tipo, dados["customer_id"],
        )
        await db.commit()
        return

    # A marca d'água de ordem vale SÓ para eventos de assinatura, porque só eles
    # escrevem premium_until — que é o que a guarda existe para proteger. O
    # checkout ficar de fora não é detalhe: o Stripe cria a assinatura ANTES de
    # a sessão completar, então `subscription.created` costuma trazer um
    # `created` MENOR que o do checkout. Se o checkout movesse a marca, o evento
    # que carrega o período entraria como atrasado e o portão nunca abriria na
    # primeira compra. Amarrar ids é idempotente, então checkout velho é inócuo.
    if tipo in EVENTOS_ASSINATURA:
        if user.stripe_event_at and dados["stripe_created"] < user.stripe_event_at:
            # Visto e descartado de propósito — diferente de não ter dono, por
            # isso ganha processed_at.
            logger.info("stripe: evento %s fora de ordem, descartado", dados["event_id"])
            await _marcar_processado(dados["event_id"], db)
            return
        user.stripe_event_at = dados["stripe_created"]

    _aplicar(user, evento, dados)
    await _marcar_processado(dados["event_id"], db)


async def _marcar_processado(event_id: str, db: AsyncSession) -> None:
    linha = await db.get(StripeWebhookEvent, event_id)
    if linha is not None:
        linha.processed_at = datetime.now(timezone.utc)
    await db.commit()


class GatewayCancelFailed(Exception):
    """O gateway recusou o cancelamento. Quem traduz para HTTP é o router —
    service neste repo não conhece HTTP."""


async def cancel_subscription(subscription_id: str) -> None:
    """Cancela a assinatura no Stripe.

    Única saída para o Stripe neste ticket, e é ela que os testes stubam. Usa
    a API assíncrona do SDK em vez de `asyncio.to_thread`: a versão síncrona
    faria uma chamada HTTP bloqueante travar o event loop.
    """
    try:
        await stripe.Subscription.cancel_async(subscription_id, api_key=_chave())
    except Exception as erro:  # noqa: BLE001 — rede, credencial ou 4xx do Stripe
        raise GatewayCancelFailed(str(erro)) from erro


# --- Reconciliação preguiçosa (issue #48) ------------------------------------
# O modelo já falha FECHADO: evento perdido só deixa acesso vencer, nunca
# concede. Isto não é proteção de receita — existe para a única direção que
# machuca quem paga: pagou, o evento se perdeu, e o app diz que não é premium.

# Depois destes o Stripe não tem mais nada a dizer sobre a assinatura, então
# perguntar de novo só gastaria rede.
STATUS_TERMINAIS = frozenset({"canceled", "incomplete_expired"})

# Janela entre duas consultas sobre a MESMA pessoa. Sem ela, quem está em
# `past_due` com o período já vencido casa com o gatilho para sempre e carrega
# uma chamada de rede em toda requisição.
# ponytail: cache em processo, que basta para um worker de uvicorn (ver
# start.sh). Vira coluna `plan_synced_at` no dia em que rodar com --workers > 1
# ou mais de uma instância.
JANELA_CONSULTA = timedelta(minutes=15)
_ULTIMA_CONSULTA: dict[uuid.UUID, datetime] = {}


async def fetch_subscription(subscription_id: str) -> dict:
    """Lê a assinatura no gateway. Saída de rede, e é ela que os testes stubam.

    Devolve dict puro: o resto do módulo trata evento como dado, não como
    objeto do SDK, e é isso que mantém a troca de gateway localizada.
    """
    sub = await stripe.Subscription.retrieve_async(subscription_id, api_key=_chave())
    # `.to_dict()`, NÃO `dict(obj)`: no SDK 15 o StripeObject deixou de ser um
    # mapping e `dict(obj)` levanta TypeError. Como os testes stubavam esta
    # função com um dict, o erro só apareceria contra o Stripe de verdade — e
    # apareceria como reconciliação "falhando" em silêncio, porque o TypeError
    # cai no `except Exception` de quem chama. `to_dict()` é recursivo o
    # bastante: os aninhados voltam como dict puro (verificado contra a conta).
    return sub.to_dict()


def precisa_reconciliar(user: User, now: datetime | None = None) -> bool:
    """Gatilho estreito de propósito.

    Reconciliar em toda requisição colocaria o Stripe no caminho quente de
    todo mundo, e reconciliar quem não tem assinatura seria uma chamada que só
    pode voltar vazia. `premium_until` NULO entra junto do vencido: é o caso do
    `customer.subscription.created` perdido, em que a pessoa pagou e ficaria
    travada para sempre — o ticket dizia só `<= now`, e essa é uma ampliação
    deliberada.
    """
    if not user.stripe_subscription_id:
        return False
    if user.subscription_status in STATUS_TERMINAIS:
        return False
    return user.premium_until is None or user.premium_until <= (
        now or datetime.now(timezone.utc)
    )


async def reconcile_subscription(user: User, db: AsyncSession) -> bool:
    """Pergunta ao gateway e atualiza as colunas. Nunca levanta.

    Falha do Stripe é registrada e a requisição segue com o estado que temos:
    reconciliação que dá 500 é PIOR que coluna velha, porque a coluna velha já
    está na direção segura.
    """
    if not precisa_reconciliar(user):
        return False

    # ponytail: janela por PROCESSO. Com dois workers ou duas instâncias o
    # teto vira 2x, e em silêncio — a conta chega pelo Stripe, não por erro.
    # Escalando horizontal, mover para Redis ou para uma coluna no usuário.
    agora = datetime.now(timezone.utc)
    for antigo in [k for k, v in _ULTIMA_CONSULTA.items() if agora - v >= JANELA_CONSULTA]:
        del _ULTIMA_CONSULTA[antigo]
    if user.id in _ULTIMA_CONSULTA:
        return False
    _ULTIMA_CONSULTA[user.id] = agora

    try:
        sub = await fetch_subscription(user.stripe_subscription_id)
    except Exception as erro:  # noqa: BLE001 — rede, credencial ou 4xx do Stripe
        logger.warning(
            "stripe: reconciliação falhou para o usuário %s: %s", user.id, erro
        )
        return False

    # O mesmo `_aplicar` do webhook, e não uma segunda escrita paralela: duas
    # rotas escrevendo as mesmas colunas divergem, e a divergência aqui é
    # acesso pago errado. O tipo sintetizado escolhe o ramo certo — assinatura
    # terminada tem `ended_at`, que é a única data que vale num cancelamento
    # imediato.
    tipo = (
        "customer.subscription.deleted"
        if sub.get("status") in STATUS_TERMINAIS
        else "customer.subscription.updated"
    )
    evento = {"id": f"reconcile:{user.stripe_subscription_id}", "type": tipo,
              "data": {"object": sub}}
    _aplicar(user, evento, _projecao(evento))

    # `stripe_event_at` NÃO se move aqui. Ela é a marca d'água de ORDEM dos
    # eventos, e carimbá-la com o nosso relógio faria um webhook legítimo que
    # chegasse logo depois entrar como atrasado por diferença de relógio. O
    # preço é o inverso: um evento antigo entregue depois desta leitura ainda
    # pode sobrescrevê-la — mas só na direção segura, e a requisição seguinte
    # reconcilia de novo.
    await db.commit()
    logger.info("stripe: assinatura de %s reconciliada (%s)", user.id, sub.get("status"))
    return True


# --- Checkout e Customer Portal (issue #46) ----------------------------------
# As duas saídas ao Stripe que o USUÁRIO alcança, ambas HOSPEDADAS. O Payment
# Element exigiria abrir a CSP para js.stripe.com mais frames — afrouxar a CSP
# na mesma release que começa a processar pagamento. O preço é real e não está
# escondido: a pessoa sai do app na hora de pagar.


class GatewayError(Exception):
    """O gateway não respondeu ou recusou a criação da sessão.

    Vira 502 no router, e não 500: a falha é de um terceiro, e a mensagem
    precisa dizer isso para a pessoa saber que tentar de novo faz sentido.
    """


class CheckoutNotOurs(Exception):
    """A sessão apresentada não pertence a quem está pedindo."""


class CheckoutNotPaid(Exception):
    """A sessão existe mas não foi paga."""


async def create_checkout_session(
    *,
    client_reference_id: str,
    price_id: str,
    customer_id: str | None,
    success_url: str,
    cancel_url: str,
) -> str:
    """Cria a sessão de Checkout e devolve a URL para onde redirecionar.

    `client_reference_id` é o id do usuário, e é a ÚNICA vez em que o Stripe
    ainda não sabe quem é a pessoa — o `_dono` do webhook depende dele para
    casar a primeira compra. Dali em diante casa por `stripe_customer_id`.
    """
    parametros = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "client_reference_id": client_reference_id,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "locale": "pt-BR",
        # #107: o Stripe mostra o checkbox dos termos na página dele e grava o
        # aceite na sessão (`consent.terms_of_service = "accepted"`), com
        # carimbo de tempo, colado ao pagamento. Exige a URL dos termos em
        # Settings → Business → Public details, nos DOIS modos: sem ela a
        # sessão não é criada, e não degrada, quebra.
        "consent_collection": {"terms_of_service": "required"},
    }
    # Reaproveita o customer de quem já comprou antes. Deixar o Stripe criar um
    # segundo deixaria metade dos eventos futuros sem dono, porque a busca é
    # por `stripe_customer_id`.
    if customer_id:
        parametros["customer"] = customer_id

    try:
        sessao = await stripe.checkout.Session.create_async(
            **parametros, api_key=_chave()
        )
    except Exception as erro:  # noqa: BLE001 — rede, credencial ou 4xx do Stripe
        raise GatewayError(str(erro)) from erro
    return sessao.url


async def create_portal_session(*, customer_id: str, return_url: str) -> str:
    """Cria a sessão do Customer Portal e devolve a URL.

    Cancelamento, troca de cartão e histórico de faturas numa superfície só. Um
    endpoint próprio de cancelar entregaria um terço da feature.
    """
    try:
        sessao = await stripe.billing_portal.Session.create_async(
            customer=customer_id, return_url=return_url, api_key=_chave()
        )
    except Exception as erro:  # noqa: BLE001
        raise GatewayError(str(erro)) from erro
    return sessao.url


async def fetch_checkout_session(session_id: str) -> dict:
    """Lê a sessão de Checkout. Saída de rede, e é ela que os testes stubam."""
    try:
        sessao = await stripe.checkout.Session.retrieve_async(
            session_id, api_key=_chave()
        )
        # DENTRO do try, e com `.to_dict()`: `dict(obj)` levanta TypeError no
        # SDK 15, e cá fora ele escapava do GatewayError e virava 500 na volta
        # de toda primeira compra.
        return sessao.to_dict()
    except Exception as erro:  # noqa: BLE001
        raise GatewayError(str(erro)) from erro


async def confirm_checkout(user: User, session_id: str, db: AsyncSession) -> None:
    """Fecha a corrida da PRIMEIRA compra, na volta do Checkout.

    Lacuna registrada no ADR 0001: o redirect chega antes do webhook, e a
    reconciliação preguiçosa não cobre este instante porque exige
    `stripe_subscription_id` — que é justamente o que ainda não veio. A sessão
    de Checkout traz os dois ids, então amarrá-los aqui deixa a reconciliação
    conseguir trabalhar em seguida.

    Nada disto substitui o webhook: ele continua sendo a fonte da verdade, e
    este caminho só antecipa o que ele traria segundos depois.
    """
    sessao = await fetch_checkout_session(session_id)

    # O id da sessão chega pela URL, ou seja, pelo CLIENTE. Sem esta conferência
    # qualquer pessoa apresentaria a sessão de outra e levaria o premium dela
    # junto do customer, o que ainda deixaria os eventos da vítima sem dono.
    if sessao.get("client_reference_id") != str(user.id):
        raise CheckoutNotOurs()

    if sessao.get("status") != "complete" or sessao.get("payment_status") != "paid":
        raise CheckoutNotPaid()

    # O MESMO `_aplicar` do webhook, com o tipo de checkout: ele já sabe que
    # checkout só AMARRA ids e não move o portão.
    evento = {
        "id": f"checkout-return:{session_id}",
        "type": EVENTO_CHECKOUT,
        "data": {"object": sessao},
    }
    _aplicar(user, evento, _projecao(evento))
    await db.commit()

    # A compra invalida a janela de consulta: sem isto, quem estava vencido e
    # voltou a assinar dentro de 15 minutos de uma reconciliação anterior
    # ficaria sem premium até a janela expirar.
    _ULTIMA_CONSULTA.pop(user.id, None)
    await reconcile_subscription(user, db)
