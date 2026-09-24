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
from app.config import get_settings
from app.models.sql_models import LoginThrottle, PasswordResetToken, RefreshToken, User
from app.services.auth_service import _hash_token
from app.services.throttle_service import email_key_hash

COOKIE = get_settings().refresh_cookie_name


@pytest.fixture(autouse=True)
def brevo_configurado(monkeypatch):
    # Sem chave o endpoint responde 503 (testado à parte), então a suíte
    # inteira precisa da recuperação ligada.
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "brevo_api_key", "xkeysib-teste")
    yield settings


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
async def test_forgot_password_is_case_insensitive_on_email(client, enviados):
    # A rota é a única das quatro (register/login/PUT me/forgot-password) que
    # não normalizava caixa: quem se cadastrou como "Joao@x.com" e digitava
    # "joao@x.com" aqui recebia 202 e nenhum e-mail (fix round 2, issue #22).
    email, _ = await registrar(client)
    outra_caixa = email.upper()

    res = await client.post("/auth/forgot-password", json={"email": outra_caixa})

    assert res.status_code == 202
    assert enviados[-1]["para"] == email


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
async def test_reset_invalidates_an_access_token_issued_before_it(client, enviados):
    # #156: o refresh token já cai (teste abaixo), mas o access token de 15min
    # emitido ANTES do reset continuava valendo até expirar por conta própria —
    # ele não passa pelo Postgres, só pela assinatura. O epoch por usuário
    # fecha essa janela: reset_password incrementa `token_epoch`, e o claim
    # `ep` do token antigo (gravado no momento da emissão) nunca mais bate.
    email, body = await registrar(client)
    token_antigo = body["access_token"]

    await client.post("/auth/forgot-password", json={"email": email})
    await client.post(
        "/auth/reset-password",
        json={"token": link_do(enviados), "new_password": "novasenha1"},
    )

    res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token_antigo}"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_reset_cascades_over_a_predecessor_still_inside_the_rotation_grace(client, enviados):
    # Revisão do #156: a query antiga da cascata (`revoked IS false`) não
    # tocava um sucessor rotacionado há menos de ROTATION_REUSE_GRACE — ele
    # já está com revoked=True, e seu revoked_at recente sobrevivia ao reset.
    # Reapresentar esse token depois ainda caía no ramo "dentro da janela" de
    # rotate_refresh_token, que relê o epoch ATUAL do usuário e devolve um
    # par novo — ressuscitando a sessão que o reset dizia ter encerrado, com
    # o próprio epoch novo de brinde. Determinístico, não uma corrida: só
    # precisa rotacionar uma vez antes do reset.
    email, _ = await registrar(client)
    r0 = client.cookies.get(COOKIE)
    await client.post("/auth/refresh")  # rotaciona r0 -> r1; r0.revoked_at fica recente

    await client.post("/auth/forgot-password", json={"email": email})
    await client.post(
        "/auth/reset-password",
        json={"token": link_do(enviados), "new_password": "novasenha1"},
    )

    client.cookies.clear()
    client.cookies.set(COOKIE, r0)
    ressuscitado = await client.post("/auth/refresh")
    assert ressuscitado.status_code == 401


@pytest.mark.asyncio
async def test_reset_login_refresh_then_me_works(client, enviados):
    # Guarda rotate_refresh_token passando o epoch ATUAL do usuário (lido do
    # banco na rotação), não um epoch zero ou em cache: sem isto, o access
    # token emitido pelo /auth/refresh logo após o reset carregaria um `ep`
    # desatualizado e cairia num 401 tão bobo quanto o buraco que o próprio
    # reset deveria fechar.
    email, _ = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})
    await client.post(
        "/auth/reset-password",
        json={"token": link_do(enviados), "new_password": "novasenha1"},
    )

    login = await client.post(
        "/auth/login", json={"email": email, "password": "novasenha1"}
    )
    assert login.status_code == 200

    refreshed = await client.post("/auth/refresh")
    assert refreshed.status_code == 200

    me = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"},
    )
    assert me.status_code == 200


@pytest.mark.asyncio
async def test_reset_revokes_every_session(client, enviados, db_session):
    email, _ = await registrar(client)
    refresh = client.cookies.get(COOKIE)
    await client.post("/auth/forgot-password", json={"email": email})

    await client.post(
        "/auth/reset-password",
        json={"token": link_do(enviados), "new_password": "novasenha1"},
    )

    # Quem redefine ou esqueceu a senha ou desconfia que alguém a tem. Nos dois
    # casos, um refresh vivo de 7 dias anularia o motivo de ter redefinido.
    # Limpa antes de setar: o cookie que o servidor emitiu vive em Path=/auth,
    # o setado aqui explicitamente vai pra "/", e isso deixa claro qual dos
    # dois o servidor de fato recebe.
    client.cookies.clear()
    client.cookies.set(COOKIE, refresh)
    usado = await client.post("/auth/refresh")
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


@pytest.mark.asyncio
async def test_reset_clears_the_victims_throttle(client, enviados, db_session):
    # Sem isso, uma vítima sob ataque (alguém errando a senha dela 1x/min)
    # continuava recebendo 429 do check_throttle mesmo depois de trocar a
    # senha — a única saída que a issue #22 prometia pra vítima não saía do
    # papel (fix round 2).
    email, _ = await registrar(client, senha="secret123")
    await client.post("/auth/forgot-password", json={"email": email})
    token = link_do(enviados)

    # Arma o throttle igual a test_auth_throttle.py: contador alto direto na
    # tabela, sem esperar as falhas de verdade.
    db_session.add(LoginThrottle(
        key_hash=email_key_hash(email), failure_count=20, last_failure_at=datetime.now(timezone.utc),
    ))
    await db_session.commit()

    reset = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": "novasenha1"}
    )
    assert reset.status_code == 204

    res = await client.post("/auth/login", json={"email": email, "password": "novasenha1"})
    assert res.status_code == 200


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
    from app.config import get_settings

    email, _ = await registrar(client)
    await client.post("/auth/forgot-password", json={"email": email})

    html = enviados[-1]["html"]
    assert enviados[-1]["para"] == email
    assert "/redefinir-senha?token=" in html
    # A pessoa precisa saber que o link morre, senão um link expirado parece
    # um link quebrado e vira chamado de suporte. O número vem de
    # `settings.password_reset_expire_minutes`, não de um literal no texto.
    minutos = get_settings().password_reset_expire_minutes
    assert f"{minutos} minutos" in html


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



@pytest.mark.asyncio
async def test_a_login_verified_just_before_a_reset_does_not_survive_it(client, db_session, monkeypatch):
    # #165: o login confere a senha, e só depois grava o refresh token. Uma
    # redefinição de senha que commitasse no meio derrubava toda sessão
    # existente — mas o refresh do login, gravado DEPOIS da cascata,
    # sobrevivia. A pessoa que redefiniu a senha porque desconfiava de
    # alguém ficava com esse alguém logado por 7 dias.
    #
    # A redefinição roda dentro do próprio verify_and_upgrade (na thread do
    # to_thread, devolvendo ao loop por run_coroutine_threadsafe): cai
    # exatamente depois de a senha antiga ser aceita e antes dos tokens.
    import asyncio

    from app.services.auth_service import create_password_reset, reset_password
    from tests.conftest import TestSessionLocal

    email = "vitima@test.com"
    res = await client.post(
        "/auth/register",
        json={"name": "Vera", "email": email, "password": "antiga12345", "accept_privacy": True},
    )
    assert res.status_code == 201
    user_id = res.json()["user"]["id"]
    client.cookies.clear()

    loop = asyncio.get_running_loop()
    verificar_de_verdade = auth_router.verify_and_upgrade

    async def _redefine():
        async with TestSessionLocal() as outra:
            token = await create_password_reset(user_id, outra)
            assert await reset_password(token, "novinha12345", outra)

    def _verifica_e_redefine_no_meio(senha, hash_):
        resultado = verificar_de_verdade(senha, hash_)
        asyncio.run_coroutine_threadsafe(_redefine(), loop).result(timeout=10)
        return resultado

    monkeypatch.setattr(auth_router, "verify_and_upgrade", _verifica_e_redefine_no_meio)
    login = await client.post("/auth/login", json={"email": email, "password": "antiga12345"})

    assert login.status_code == 401
    vivos = (
        await db_session.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == uuid.UUID(user_id), RefreshToken.revoked.is_(False)
            )
        )
    ).scalars().all()
    assert vivos == []
