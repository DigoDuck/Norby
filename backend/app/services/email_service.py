"""Envio de e-mail transacional pela API v3 do Brevo (issue #36).

Por que a API HTTP e não SMTP: o `httpx` já vem no lock (o SDK do Stripe o
traz), então esta rota custa ZERO dependência nova, enquanto SMTP exigiria
`aiosmtplib` ou o `smtplib` bloqueante dentro de uma thread — e chamada
bloqueante no event loop é justamente o que o billing evitou ao usar as
versões `_async` do SDK. De quebra a API devolve um `messageId`, que torna um
e-mail não entregue diagnosticável.

Sem template do Brevo, e isso é decisão: o corpo do e-mail de recuperação
precisa casar com o formato do link que o token valida. Deixar esse texto fora
do repositório colocaria a única peça que precisa concordar com o código num
lugar onde nenhum teste alcança.

`enviar_email` é o SEAM: é ela que os testes stubam, do mesmo jeito que
`ai_service._gerar_json`. Nenhum teste sai para a rede.
"""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger("norby.email")

API = "https://api.brevo.com/v3/smtp/email"
TIMEOUT = 10.0


class EmailNotConfigured(Exception):
    """Sem `BREVO_API_KEY` no momento do envio.

    O router já barra isso alto, ANTES de agendar o envio (checagem em
    `auth.py`, resposta 503) — na prática esta exceção é a última linha de
    defesa, só alcançável se a chave sumir entre o pre-check e a BackgroundTask
    rodar. `mandar_link_de_recuperacao` a engole em silêncio, sem logar: a
    resposta já foi entregue e não há para quem reportar o erro.
    """


class EmailFailed(Exception):
    """O Brevo recusou ou não respondeu."""


async def enviar_email(*, para: str, assunto: str, html: str) -> str:
    """Envia e devolve o `messageId`. Levanta em vez de devolver falso.

    Quem chama decide o que fazer com a falha; aqui não se engole erro, porque
    "o e-mail não chegou" é indistinguível de "o e-mail nunca foi tentado" para
    quem está do lado de fora esperando o link.
    """
    settings = get_settings()
    if not settings.brevo_api_key:
        raise EmailNotConfigured()

    corpo = {
        "sender": {
            "email": settings.brevo_sender_email,
            "name": settings.brevo_sender_name,
        },
        "to": [{"email": para}],
        "subject": assunto,
        "htmlContent": html,
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as cliente:
            resposta = await cliente.post(
                API,
                json=corpo,
                headers={
                    "api-key": settings.brevo_api_key,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
            )
        resposta.raise_for_status()
    except Exception as erro:  # noqa: BLE001 — rede, credencial ou 4xx do Brevo
        # O endereço NÃO entra no log: um log de erro que lista e-mails de quem
        # pediu recuperação é a mesma enumeração de conta que a rota evita.
        logger.error("brevo: falha ao enviar '%s': %s", assunto, erro)
        raise EmailFailed(str(erro)) from erro

    return (resposta.json() or {}).get("messageId", "")


def html_recuperacao(link: str) -> str:
    """Corpo do e-mail de recuperação.

    ESCRITO PARA NÃO PARECER MARKETING, e isso foi medido, não suposto: a
    primeira versão tinha um botão azul com padding e borda arredondada, mais
    uma segunda linha repetindo a URL, e o Gmail entregou em PROMOÇÕES. Para
    recuperação de senha isso é quase tão ruim quanto spam — quem está trancado
    para fora não procura naquela aba.

    O que mudou e por quê:

    - UM link, em texto, e não um botão. Botão colorido é sinal de campanha; um
      link inline é sinal de correspondência.
    - A URL aparece por extenso, então a linha "ou copie este endereço" saiu.
      Ela dobrava a contagem de links sem acrescentar nada.
    - Sem cor, sem imagem, sem CSS além do mínimo. Marcação leve pesa a favor.

    O que NÃO dá para consertar aqui: o Brevo injeta pixel de abertura e
    reescreve os links para rastrear clique, e isso não é desligável por
    mensagem na API. É o sinal de promoção que sobra, e o preço da plataforma.

    Texto curto de propósito. E-mail de recuperação é lido com pressa, muitas
    vezes no celular, por alguém já irritado por não conseguir entrar.
    """
    minutos = get_settings().password_reset_expire_minutes
    return f"""<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6">
  <p>Você pediu para redefinir sua senha do Norby.</p>
  <p>Abra este endereço para criar uma nova senha:</p>
  <p><a href="{link}">{link}</a></p>
  <p>O link vale por {minutos} minutos e só pode ser usado uma vez.</p>
  <p>Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>
</div>"""
