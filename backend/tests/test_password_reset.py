"""Recuperação de senha (issue #36).

O que esta rota tem de perigoso não é trocar a senha: é que ela recebe um
e-mail de quem NÃO está autenticado. Então metade dos testes aqui é sobre o
que ela se recusa a contar — se o endereço existe, se o token já valeu, se
expirou — e a outra metade é sobre o token ser realmente de uso único.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import app.routers.auth as auth_router
from app.models.sql_models import PasswordResetToken, RefreshToken, User
from app.services.auth_service import _hash_token


@pytest.fixture(autouse=True)
def brevo_configurado(monkeypatch):
    # Sem chave o endpoint responde 503 (testado à parte), então a suíte
    # inteira precisa da recuperação ligada.
    from app.config import get_settings

    settings = get_settings()
    antes = settings.brevo_api_key
    settings.brevo_api_key = "xkeysib-teste"
    yield settings
    settings.brevo_api_key = antes


@pytest.fixture
def enviados(monkeypatch):
    """Substitui o único ponto de saída para a rede e guarda o que foi enviado."""
    caixa = []

    async def _fake(*, para, assunto, html):
        caixa.append({"para": para, "assunto": assunto, "html": html})
        return "msg-1"

    monkeypatch.setattr(auth_router, "enviar_email", _fake)
    return caixa


async def registrar(client, senha="secret123"):
    email = f"p_{uuid.uuid4().hex[:8]}@test.com"
    res = await client.post(
        "/auth/register",
        json={"name": "Ana Silva", "email": email, "password": senha, "accept_privacy": True},
    )
    assert res.status_code == 201, res.text
    return email, res.json()


def link_do(caixa):
    """Extrai o token do e-mail, que é como a pessoa real o obtém."""
    html = caixa[-1]["html"]
    return html.split("?token=")[1].split('"')[0]


# --- O que a rota se recusa a contar ----------------------------------------


@pytest.mark.asyncio
async def test_answers_the_same_for_an_unknown_email(client, enviados):
    conhecido, _ = await registrar(client)

    a = await client.post("/auth/forgot-password", json={"email": conhecido})
    b = await client.post("/auth/forgot-password", json={"email": "ninguem@test.com"})

    # Corpo e status idênticos: distinguir aqui seria um verificador de quem
    # tem conta no Norby, a mesma enumeração que o login evita.
    assert a.status_code == b.status_code == 202
    assert a.json() == b.json()


@pytest.mark.asyncio
async def test_sends_nothing_for_an_unknown_email(client, enviados):
    # A resposta é igual, mas o e-mail não sai: mandar "alguém pediu sua senha"
    # para um endereço sem conta seria usar o Norby como mailbomb.
    await client.post("/auth/forgot-password", json={"email": "ninguem@test.com"})
    assert enviados == []


@pytest.mark.asyncio
async def test_a_used_and_an_expired_token_answer_the_same(client, enviados, db_session):
    email, _ = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})
    token = link_do(enviados)

    primeira = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "novasenha1"}
    )
    assert primeira.status_code == 204

    # Reapresentar o mesmo link não pode dizer "este já foi usado".
    segunda = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "outrasenha1"}
    )
    inexistente = await client.post(
        "/auth/reset-password", json={"token": "z" * 40, "new_password": "outrasenha1"}
    )
    assert segunda.status_code == inexistente.status_code == 400
    assert segunda.json() == inexistente.json()


# --- Uso único e prazo -------------------------------------------------------


@pytest.mark.asyncio
async def test_the_password_actually_changes(client, enviados):
    email, _ = await registrar(client, senha="secret123")
    await client.post("/auth/forgot-password", json={"email": email})

    res = await client.post(
        "/auth/reset-password",
        json={"token": link_do(enviados), "new_password": "novasenha1"},
    )
    assert res.status_code == 204

    velha = await client.post("/auth/login", json={"email": email, "password": "secret123"})
    nova = await client.post("/auth/login", json={"email": email, "password": "novasenha1"})
    assert velha.status_code == 401
    assert nova.status_code == 200


@pytest.mark.asyncio
async def test_reset_revokes_every_session(client, enviados, db_session):
    email, tokens = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})

    await client.post(
        "/auth/reset-password",
        json={"token": link_do(enviados), "new_password": "novasenha1"},
    )

    # Quem redefine ou esqueceu a senha ou desconfia que alguém a tem. Nos dois
    # casos, um refresh vivo de 7 dias anularia o motivo de ter redefinido.
    usado = await client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert usado.status_code == 401


@pytest.mark.asyncio
async def test_using_one_link_kills_the_other_pending_ones(client, enviados, db_session):
    email, _ = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})
    primeiro = link_do(enviados)
    await client.post("/auth/forgot-password", json={"email": email})
    segundo = link_do(enviados)
    assert primeiro != segundo

    assert (
        await client.post(
            "/auth/reset-password", json={"token": segundo, "new_password": "novasenha1"}
        )
    ).status_code == 204

    # Pedir dois e-mails e usar um não pode deixar o outro vivo na caixa.
    res = await client.post(
        "/auth/reset-password", json={"token": primeiro, "new_password": "terceira123"}
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_an_expired_token_is_refused(client, enviados, db_session):
    email, _ = await registrar(client)
    user = await db_session.scalar(select(User).where(User.email == email))

    cru = "expirado-" + uuid.uuid4().hex
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(cru),
            expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        )
    )
    await db_session.commit()

    res = await client.post(
        "/auth/reset-password", json={"token": cru, "new_password": "novasenha1"}
    )
    assert res.status_code == 400


# --- O token no banco --------------------------------------------------------


@pytest.mark.asyncio
async def test_only_the_hash_is_stored(client, enviados, db_session):
    email, _ = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})
    cru = link_do(enviados)

    # O token viaja por e-mail; o banco não precisa dele para validar. Guardar
    # o valor cru transformaria um dump do banco em acesso a todas as contas
    # com link pendente.
    achado_pelo_cru = await db_session.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == cru)
    )
    achado_pelo_hash = await db_session.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash_token(cru))
    )
    assert achado_pelo_cru is None
    assert achado_pelo_hash is not None


# --- Contrato de senha e provisionamento ------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("fraca", ["semnumero", "1234567", "curta1"])
async def test_the_new_password_obeys_the_same_rules_as_signup(client, enviados, fraca):
    # O caminho que valida menos é o que um atacante escolhe. Cadastro e
    # redefinição compartilham o mesmo tipo (StrongPassword) por isso.
    email, _ = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})

    res = await client.post(
        "/auth/reset-password", json={"token": link_do(enviados), "new_password": fraca}
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_without_a_brevo_key_it_refuses_loudly(client, brevo_configurado):
    # 503 e não 202: aqui não há atacante a proteger, há um dono que precisa
    # saber que a variável não existe. Responder 202 e nunca enviar deixaria
    # a recuperação quebrada em silêncio.
    brevo_configurado.brevo_api_key = ""
    res = await client.post("/auth/forgot-password", json={"email": "quem@test.com"})
    assert res.status_code == 503


@pytest.mark.asyncio
async def test_the_email_carries_a_link_to_the_reset_page(client, enviados):
    email, _ = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})

    html = enviados[-1]["html"]
    assert enviados[-1]["para"] == email
    assert "/redefinir-senha?token=" in html
    # A pessoa precisa saber que o link morre, senão um link expirado parece
    # um link quebrado e vira chamado de suporte.
    assert "30 minutos" in html


@pytest.mark.asyncio
async def test_the_email_does_not_look_like_marketing(client, enviados):
    """Medido, não suposto.

    A primeira versão tinha um botão colorido com padding e uma segunda linha
    repetindo a URL. O Gmail entregou em PROMOÇÕES, o que para recuperação de
    senha é quase tão ruim quanto spam: quem está trancado para fora não
    procura naquela aba. Um link em texto sinaliza correspondência; botão e
    links repetidos sinalizam campanha.

    O pixel de abertura e a reescrita de links que o Brevo injeta continuam
    lá — não são desligáveis por mensagem na API, e por isso não são testáveis
    aqui. Este teste guarda a parte que é nossa.
    """
    email, _ = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})
    html = enviados[-1]["html"]

    assert html.count("<a ") == 1, "mais de um link volta a parecer campanha"
    assert "background:" not in html, "botao colorido e o sinal mais forte de promocao"
    assert "<img" not in html

