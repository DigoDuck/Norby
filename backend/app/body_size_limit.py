"""Teto global de tamanho do corpo da requisição (issue #152, scan F1/F8).

ASGI PURO, não `BaseHTTPMiddleware` — aquele já materializa o `Request` para
entregar ao `call_next`, então por definição não corta nada ANTES do corpo
estar todo na memória. Aqui a contagem roda em cima das mensagens cruas de
`receive()`, corta assim que passam do teto e nunca deixa o corpo terminar de
chegar. É o único jeito de barrar um POST anônimo chunked (sem
`Content-Length`) de alguns GB antes dele derrubar o worker único por OOM —
`Request.body()` do Starlette concatena sem limite, e o FastAPI chama isso
para montar o modelo Pydantic ANTES do endpoint (e do `@limiter.limit`) rodar.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# 1 MiB. Bem acima de qualquer payload JSON legítimo deste projeto; existe só
# para matar corpo hostil, não para ser fino.
BODY_SIZE_LIMIT = 1_048_576

# PUT /auth/me/photo já lê em stream com teto PRÓPRIO de 2 MB
# (`app/services/photo_service.py::MAX_BYTES`) e verifica a cada pedaço
# recebido (`async for pedaco in request.stream()`) — não acumula sem limite
# mesmo sem este middleware. Um segundo teto aqui só poderia ser MAIOR (2 MB +
# folga) para não recusar upload válido antes da hora, ou seja, mais FROUXO
# que o que já existe. "Decida pelo menor": isentar mantém o teto efetivo
# nos 2 MB da rota, que é menor que 2 MB + folga — por isso a isenção, não a
# duplicação.
PHOTO_UPLOAD_PATH = "/auth/me/photo"

# Mesmo texto do 413 que o webhook do Stripe já usa (billing.py) — um único
# contrato de erro de "corpo grande demais" na API inteira.
_DETALHE = b'{"detail": "Corpo grande demais"}'


def _resposta_413_mensagens() -> tuple[Message, Message]:
    inicio: Message = {
        "type": "http.response.start",
        "status": 413,
        "headers": [(b"content-type", b"application/json")],
    }
    fim: Message = {"type": "http.response.body", "body": _DETALHE, "more_body": False}
    return inicio, fim


def _content_length_declarado(scope: Scope) -> int | None:
    for nome, valor in scope.get("headers", []):
        if nome == b"content-length":
            try:
                return int(valor)
            except ValueError:
                return None  # header malformado: quem decide é a contagem real
    return None


class BodySizeLimitMiddleware:
    """Corta em 413 antes do FastAPI ler o corpo, sem depender de exceção.

    Levantar exceção dentro do `receive()` embrulhado NÃO é confiável aqui: o
    `get_request_handler` do FastAPI já tem um `except Exception` genérico em
    volta do `await request.body()` que converteria qualquer coisa nossa em
    400 (rota com corpo Pydantic) ou o desconhecido viraria 500 (rota como o
    webhook, que lê o corpo à mão). Por isso a resposta é mandada por `send()`
    diretamente, e o `receive`/`send` de baixo são substituídos para o app não
    continuar nem mandar uma segunda resposta por cima da nossa.

    Isso garante que o CLIENTE só vê o 413 — mas não evita que, por baixo, o
    `http.disconnect` devolvido vire `ClientDisconnect` dentro do
    `request.body()`/`request.stream()` de quem estava lendo (o webhook, ou o
    parsing de corpo do FastAPI), suba até o `request_context` em `main.py` e
    monte ali um 500 que o `send_apos_recusa` acima engole antes de chegar ao
    fio. Esse 500 interno é inofensivo (nunca sai da API), mas por isso o
    `request_context` trata `ClientDisconnect` à parte, sem `logger.exception`
    — senão toda recusa 413 também gravava um traceback de ERROR no log.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] == PHOTO_UPLOAD_PATH:
            await self.app(scope, receive, send)
            return

        # Content-Length declarado: recusa sem ler um byte do corpo.
        declarado = _content_length_declarado(scope)
        if declarado is not None and declarado > BODY_SIZE_LIMIT:
            inicio, fim = _resposta_413_mensagens()
            await send(inicio)
            await send(fim)
            return

        total = 0
        recusado = False

        async def receive_com_teto() -> Message:
            nonlocal total, recusado
            if recusado:
                # Já recusamos: sinaliza desconexão pra quem está lendo lá
                # embaixo não ficar esperando um pedaço que não vamos entregar.
                return {"type": "http.disconnect"}
            mensagem = await receive()
            if mensagem["type"] == "http.request":
                total += len(mensagem.get("body") or b"")
                if total > BODY_SIZE_LIMIT:
                    recusado = True
                    inicio, fim = _resposta_413_mensagens()
                    await send(inicio)
                    await send(fim)
                    return {"type": "http.disconnect"}
            return mensagem

        async def send_apos_recusa(mensagem: Message) -> None:
            # Depois do nosso 413, o app por baixo ainda pode tentar mandar a
            # PRÓPRIA resposta (ex.: 400 ao interpretar o `http.disconnect`
            # acima como desconexão do cliente). Engolir evita erro de
            # "resposta ASGI duplicada" por cima de uma resposta já enviada.
            if recusado:
                return
            await send(mensagem)

        await self.app(scope, receive_com_teto, send_apos_recusa)
