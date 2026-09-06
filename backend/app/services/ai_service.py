from google import genai
from google.genai import types
import uuid
from datetime import date, datetime, time, timedelta, timezone
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import ai_insights_collection
from app.models.sql_models import AiUsageDaily, Transaction, TransactionType
from app.services.dashboard_service import _income_expense, top_expense_categories
from app.services.goal_service import current_month_range
from app.services.plan_service import PlanRefused
from app.services.score_service import compute_financial_score
from app.config import get_settings
import hashlib
import json
import logging

logger = logging.getLogger(__name__)

# Nº de mensagens recentes enviadas como contexto ao Gemini (evita estourar o limite).
MAX_CHAT_HISTORY_MESSAGES = 10

settings = get_settings()

# SDK MANTIDO (issue #40). O `google-generativeai` foi arquivado em novembro de
# 2025, sem correção de bug nem de segurança, e o modelo daqui é posterior a
# essa data. A troca também ENCOLHE o código: este cliente fala async nativo,
# então os dois `asyncio.to_thread` que existiam para não travar o event loop
# saíram junto.
client = genai.Client(api_key=settings.gemini_api_key)
MODELO = "gemini-3.5-flash-lite"

# Teto de saída POR CHAMADA. Sem ele uma única chamada não tem limite de custo.
# É outra coisa do teto diário em desenho no #21: aquele limita quanto a pessoa
# gasta por dia, este limita o quão ruim UMA chamada consegue ser. Os valores
# são folgados de propósito — o JSON do insight tem ~100 tokens e a resposta do
# chat é curta —, porque truncar a saída só troca custo por resposta quebrada.
MAX_TOKENS_INSIGHT = 512
MAX_TOKENS_CHAT = 1024

# --- Cota diária de IA (issue #21, ADR 0003) --------------------------------
# Dois tetos por usuário e por dia da cota. Valem para quem passa pelo portão
# de plano (trial incluído) e não dependem de `paywall_enabled`: a cota protege
# a produção a partir do merge, não a partir da virada do paywall.
#
# Tokens: 120k é a faixa de equilíbrio do #18 contra os R$ 20/mês, dimensionada
# para o tier PAGO de propósito, para não mudar quando o faturamento ligar.
# Chamadas: a chave de produção está no tier gratuito, com RPD 500 compartilhado
# por todos os usuários do projeto; 100 = RPD/5, para um script sozinho gastar
# no máximo um quinto do dia de todo mundo. Um dia pesado legítimo (30 trocas
# de chat + 20 regenerações de insight) cabe duas vezes.
DAILY_TOKEN_CAP = 120_000
DAILY_CALL_CAP = 100
DAILY_CAP_MESSAGE = (
    "Você atingiu o limite diário da assistente. "
    "Ele libera de novo às 5h da manhã (horário de Brasília)."
)
# O dia da cota é o dia do Google: o RPD do projeto zera à meia-noite do
# Pacífico e o painel do AI Studio usa UTC-8 fixo. Alinhar faz o teto por
# usuário ser uma fração honesta do dia compartilhado (com dia UTC, um usuário
# ganharia dois tetos dentro de um dia do Google). Se o Google seguir o horário
# de verão do Pacífico, o reset dele cai uma hora antes do nosso: erro para o
# lado seguro. Offset fixo de propósito: sem tabela de fuso.
QUOTA_TZ = timezone(timedelta(hours=-8))


def dia_da_cota(now: datetime | None = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(QUOTA_TZ).date()


def cota_zera_em(now: datetime | None = None) -> datetime:
    """Próxima meia-noite UTC-8, devolvida em UTC (vai no `resets_at` do 403)."""
    local = (now or datetime.now(timezone.utc)).astimezone(QUOTA_TZ)
    meia_noite = datetime.combine(local.date() + timedelta(days=1), time.min, tzinfo=QUOTA_TZ)
    return meia_noite.astimezone(timezone.utc)


def _tokens_usados(resposta) -> int:
    """Lê o `usage_metadata` da resposta do Gemini. Função única de propósito:
    o Google já rotula `generate_content` como "Legacy" e a API nova
    (Interactions) renomeia os campos; a migração toca só aqui.

    `total_token_count` já inclui os tokens de raciocínio quando o modelo
    pensa. Sem total, soma os componentes tratando `None` como zero. Sem
    `usage_metadata` (stub de teste, SDK quebrado) conta zero: o teto de
    chamadas continua valendo e segura o dia mesmo assim.

    Os quatro campos são lidos com `getattr(..., None)`, não acesso direto:
    isto roda DEPOIS da chamada de rede, então um `usage_metadata` com um
    formato diferente (a migração para a Interactions API) não pode levantar
    aqui — a chamada já aconteceu e precisa ser debitada de qualquer jeito.
    """
    uso = getattr(resposta, "usage_metadata", None)
    if uso is None:
        return 0
    total = getattr(uso, "total_token_count", None)
    if total is not None:
        return total
    return (
        (getattr(uso, "prompt_token_count", None) or 0)
        + (getattr(uso, "candidates_token_count", None) or 0)
        + (getattr(uso, "thoughts_token_count", None) or 0)
    )


async def _exigir_cota(db: AsyncSession, user_id: str) -> None:
    """Recusa ANTES da chamada se o dia já estourou um dos dois tetos.

    select de colunas, não `db.get`: nada passa pelo identity map, então uma
    leitura nunca devolve contadores velhos de um upsert anterior na mesma
    sessão.
    """
    linha = (
        await db.execute(
            select(AiUsageDaily.tokens, AiUsageDaily.calls).where(
                AiUsageDaily.user_id == uuid.UUID(user_id),
                AiUsageDaily.day == dia_da_cota(),
            )
        )
    ).one_or_none()
    if linha and (linha.tokens >= DAILY_TOKEN_CAP or linha.calls >= DAILY_CALL_CAP):
        # Sem texto do usuário: id e contadores bastam para ver quem bate no teto.
        logger.warning(
            "Cota diária de IA atingida (user=%s, tokens=%d, calls=%d)",
            user_id, linha.tokens, linha.calls,
        )
        raise PlanRefused("AI_DAILY_CAP_REACHED", DAILY_CAP_MESSAGE, resets_at=cota_zera_em())


async def _debitar_cota(db: AsyncSession, user_id: str, tokens: int) -> None:
    """Soma DEPOIS da chamada, com o número real. Upsert atômico como o
    `login_throttles`: duas chamadas concorrentes não perdem incremento."""
    stmt = pg_insert(AiUsageDaily).values(
        user_id=uuid.UUID(user_id), day=dia_da_cota(), tokens=tokens, calls=1
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[AiUsageDaily.user_id, AiUsageDaily.day],
        set_={"tokens": AiUsageDaily.tokens + tokens, "calls": AiUsageDaily.calls + 1},
    )
    await db.execute(stmt)
    await db.commit()


async def _com_cota(db: AsyncSession, user_id: str, chamada) -> str:
    """Envolve UMA chamada de rede: exige a cota antes, debita o uso depois.

    É o único caminho até o Gemini que conhece a cota, então um terceiro
    ponto de chamada no futuro não tem como esquecer de contar. Fica no
    service e não na dependency de propósito: a dependency roda antes do
    corpo e barraria também o insight cacheado e o score determinístico, que
    não custam nada.

    Corrida aceita: a checagem lê o acumulado antes e o débito grava depois,
    então até 10 chamadas concorrentes (o 10/min da rota) passam juntas no
    último token. Uma rajada, uma vez por dia; depois dela tudo bloqueia até
    virar o dia. Reservar antes seria um segundo UPDATE por chamada para
    proteger o último minuto de abuso, não as horas.
    """
    await _exigir_cota(db, user_id)
    texto, tokens = await chamada()
    await _debitar_cota(db, user_id, tokens)
    return texto


async def _gerar_json(prompt: str) -> tuple[str, int]:
    """Saída de rede da geração de insight. É ela que os testes stubam.

    `response_mime_type` força JSON puro (sem cercas de markdown), o que torna
    o parse confiável mesmo num modelo pequeno como o Lite. Devolve também os
    tokens usados, para quem chama debitar da cota diária.
    """
    resposta = await client.aio.models.generate_content(
        model=MODELO,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            max_output_tokens=MAX_TOKENS_INSIGHT,
        ),
    )
    return resposta.text or "", _tokens_usados(resposta)


async def _responder_chat(historico: list, mensagem: str) -> tuple[str, int]:
    """Saída de rede do chat. A outra que os testes stubam.

    A guarda de resposta vazia NÃO mora aqui: uma resposta vazia ou bloqueada
    por safety filter já consumiu uma chamada de verdade e os tokens do
    prompt — levantar antes de devolver o uso deixaria essa chamada sem
    débito, um caminho sem teto para quem forjar um prompt que sempre cai no
    filtro (achado de review de 2026-09-06). Quem levanta é `chat_with_ai`,
    depois que `_com_cota` já debitou.
    """
    chat = client.aio.chats.create(model=MODELO, history=historico)
    resposta = await chat.send_message(
        mensagem,
        config=types.GenerateContentConfig(max_output_tokens=MAX_TOKENS_CHAT),
    )
    return resposta.text or "", _tokens_usados(resposta)

async def _get_user_financial_summary(db: AsyncSession, user_id: str) -> dict:
    """Resumo do mês corrente, reusando os agregados do dashboard.

    Antes isto tinha implementação própria: duas queries separadas para receita
    e despesa (o dashboard faz numa só, com `case()`) e uma cópia literal do
    group_by do top-5. Além da query a mais, a regra do que conta como gasto do
    mês morava em dois arquivos e podia divergir em silêncio.
    """
    now = datetime.now(timezone.utc)
    start, end = current_month_range(now)

    total_income, total_expenses = await _income_expense(db, user_id, start, end)
    categories = [
        {"category": categoria, "total": total}
        for categoria, total in await top_expense_categories(db, user_id, start, end)
    ]

    return {
        "month": now.strftime("%B %Y"),
        "total_income": total_income,
        "total_expenses": total_expenses,
        "balance": total_income - total_expenses,
        "top_categories": categories,
    }


def _summary_fingerprint(summary: dict) -> str:
    """Impressão digital dos dados que embasam o texto da IA.

    Se qualquer número/categoria muda, o fingerprint muda e o texto é
    regenerado — evita a 'Leitura da IA' congelada quando as transações do mês
    mudam, sem precisar chamar o Gemini a cada carga do dashboard.
    """
    payload = json.dumps(
        {
            "income": summary.get("total_income"),
            "expenses": summary.get("total_expenses"),
            "categories": summary.get("top_categories"),
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def get_or_generate_insight(db: AsyncSession, user_id: str) -> dict:
    """Leitura da IA do mês corrente, com o texto cacheado por fingerprint.

    Sem parâmetros de mês: eles só montavam a chave do cache, enquanto o resumo
    era SEMPRE do mês corrente. Chamar com (6, 2026) em julho gravaria dados de
    julho sob a chave de junho. A assinatura prometia uma capacidade que não
    existia, e derivar a referência do mesmo `now` do resumo elimina a chance de
    as duas fontes de "mês" divergirem.
    """
    now = datetime.now(timezone.utc)
    reference = f"{now.year}-{now.month:02d}"

    # Score é sempre recalculado (determinístico) — nunca servido do cache,
    # para não congelar quando as transações do mês mudam.
    summary = await _get_user_financial_summary(db, user_id)
    score = compute_financial_score(summary)
    fingerprint = _summary_fingerprint(summary)

    # Texto (summary_text/suggested_action) é cacheado por mês, mas só
    # reaproveitado se os dados que o embasam não mudaram (fingerprint bate).
    # Assim a leitura nunca contradiz os números do dashboard.
    cached = await ai_insights_collection.find_one(
        {"user_id": user_id, "reference_month": reference}
    )
    if cached and cached.get("data_fingerprint") == fingerprint:
        cached.pop("_id", None)
        cached["score"] = score
        return cached

    # Chama o Gemini só para o texto (o número não vem mais do LLM).
    prompt = f"""
    Você é um consultor financeiro pessoal. Analise os dados abaixo e responda em português (pt-BR).
    Dados do usuário em {summary['month']}:
    - Receita total: R$ {summary['total_income']:.2f}
    - Despesas totais: R$ {summary['total_expenses']:.2f}
    - Saldo: R$ {summary['balance']:.2f}
    - Maiores categorias de gasto: {summary['top_categories']}

    responda APENAS em JSON com este formato (sem markdown):
    {{
        "summary_text": "<3 insights curtos separados por | sobre o comportamento financeiro>",
        "suggested_action": "<uma sugestão prática e específica>"
    }}
    """

    # A IA pode falhar na chamada (API/rede/quota) ou devolver texto não-JSON,
    # vazio ou bloqueado por safety filter — qualquer uma dessas falhas não
    # pode derrubar o score determinístico já calculado.
    bruto = ""
    try:
        bruto = await _com_cota(db, user_id, lambda: _gerar_json(prompt))
        data = json.loads(bruto)
        summary_text = data["summary_text"]
        suggested_action = data["suggested_action"]
    except PlanRefused as recusa:
        # Cota do dia estourada: o score é determinístico e continua real; só
        # o texto não vem. Não cacheia. Antes do `except Exception`, que
        # engoliria a recusa e mostraria "indisponível" no lugar do motivo.
        return {
            "score": score,
            "summary_text": "",
            "suggested_action": None,
            "error": recusa.message,
        }
    except Exception:
        # Nunca logar o texto cru: ele é a leitura financeira do usuário e pode
        # conter valores e categorias. Tipo da exceção + tamanho bastam para
        # diagnosticar um parse quebrado.
        raw_len = len(bruto)
        logger.exception(
            "Resposta da IA inválida ao gerar insight (user=%s, chars=%d)",
            user_id, raw_len,
        )
        # O texto da IA falhou, mas o score é determinístico — devolve o score real.
        # Não cacheia (retorna sem passar por insert_one), para tentar de novo na próxima chamada.
        return {
            "score": score,
            "summary_text": "",
            "suggested_action": None,
            "error": "Não foi possível gerar a leitura da IA",
        }

    # Cacheia só o texto + o fingerprint dos dados (score fica fora do cache).
    # upsert em (user_id, reference_month) → sempre 1 doc por usuário/mês:
    # sobrescreve o texto velho e não cria duplicados sob concorrência.
    generated_at = datetime.now(timezone.utc).isoformat()
    await ai_insights_collection.update_one(
        {"user_id": user_id, "reference_month": reference},
        {
            "$set": {
                "user_id": user_id,
                "reference_month": reference,
                "summary_text": summary_text,
                "suggested_action": suggested_action,
                "data_fingerprint": fingerprint,
                "generated_at": generated_at,
            },
            # Score é sempre recalculado, nunca servido do cache — não deixar um
            # score antigo (do código legado) persistir e ser lido por engano.
            "$unset": {"score": ""},
        },
        upsert=True,
    )
    return {
        "score": score,
        "summary_text": summary_text,
        "suggested_action": suggested_action,
        "generated_at": generated_at,
    }

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
    for msg in history[-MAX_CHAT_HISTORY_MESSAGES:]:
        content = msg.get("content")
        if not content:
            continue
        role = "user" if msg.get("role") == "user" else "model"
        chat_history.append(types.Content(role=role, parts=[types.Part(text=content)]))

    resposta = await _com_cota(
        db, user_id,
        lambda: _responder_chat(chat_history, f"{system_context}\n\nUsuário: {message}"),
    )
    if not resposta:
        # Vazia, bloqueada por safety filter ou truncada antes do primeiro
        # token. Levantar preserva o 503 claro da rota: devolver "" gravaria
        # uma bolha VAZIA no histórico como se a IA tivesse respondido. O SDK
        # antigo levantava sozinho aqui; este devolve None, então a guarda
        # passa a ser nossa. Fica DEPOIS do `_com_cota` de propósito: a
        # chamada já aconteceu e já foi debitada, então a guarda não pode
        # mais impedir o débito — só decide o que a rota faz com o resultado.
        raise ValueError("resposta vazia do Gemini")
    return resposta
