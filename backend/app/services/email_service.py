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
    """Sem `BREVO_API_KEY`. O router traduz para 503."""


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

    Texto curto de propósito. E-mail de recuperação é lido com pressa, muitas
    vezes no celular, por alguém já irritado por não conseguir entrar: cada
    frase a mais é uma chance de a pessoa não achar o botão.

    O prazo aparece porque um link que morre calado parece um link quebrado, e
    a linha final existe porque quem NÃO pediu precisa saber que não há nada a
    fazer — sem ela, o e-mail assusta em vez de informar.
    """
    return f"""\
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a;line-height:1.6">
  <p>Você pediu para redefinir sua senha do Norby.</p>
  <p><a href="{link}" style="display:inline-block;padding:12px 20px;background:#0b5c73;color:#fff;text-decoration:none;border-radius:8px">Redefinir minha senha</a></p>
  <p style="font-size:13px;color:#555">Ou copie este endereço: {link}</p>
  <p style="font-size:13px;color:#555">O link vale por 30 minutos e só pode ser usado uma vez.</p>
  <p style="font-size:13px;color:#555">Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>
</div>"""
