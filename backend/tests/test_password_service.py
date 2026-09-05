"""Hash de senha sem passlib (issue #102).

O passlib parou em 2020, prende o projeto no bcrypt 3.x — merge do bcrypt 5
derruba o app no import — e importa `crypt`, removido no Python 3.13.

A parte perigosa da troca não é gerar hash novo: é continuar verificando os
hashes que JÁ EXISTEM. Por isso os testes abaixo carregam HASHES-TESTEMUNHA
gerados pelo passlib 1.7.4 com bcrypt 3.2.2 antes da troca. Se a
reimplementação divergir em qualquer detalhe, estes testes ficam vermelhos e
ninguém descobre em produção com a conta trancada.
"""

import pytest

from app.services.password_service import (
    ROUNDS,
    hash_password,
    needs_update,
    verify_password,
)

# --- Gerados pelo passlib 1.7.4 + bcrypt 3.2.2, antes da substituição --------
# Esquema atual do app: `bcrypt_sha256`, que aplica SHA-256 antes do bcrypt e
# assim faz a senha inteira contar, sem o teto de 72 bytes do bcrypt cru.
MODERNO = [
    ("secret123", "$bcrypt-sha256$v=2,t=2b,r=12$tIxKLHZIE3mwNTd3gYQGI.$udqn2VQ6XXF5NvasI7wbzlj7.Ri1pPW"),
    ("senha com acento çãé", "$bcrypt-sha256$v=2,t=2b,r=12$zbeJVaFStxhaRnYcVg8uYu$8ogsm.8LUws2UoNCzPfZj5cOhJsOSR6"),
    ("L" * 100, "$bcrypt-sha256$v=2,t=2b,r=12$rp1vYId4g8eTIsWdkoTIa.$llGXOA0ld.KL78kZ870r5palOcSyHBS"),
]
# Esquema LEGADO, bcrypt puro. Contas antigas ainda têm hashes assim, e é o
# `verify_and_upgrade` que os troca no próximo login.
LEGADO = [
    ("secret123", "$2b$12$5zzQzEj2d1RkBBAYUWh.c.BLn3rTpCqdsyDbnihg8c6p7lakldWk6"),
    ("senha com acento çãé", "$2b$12$747qytHbaN4mn4pv6hnKhu87kvomHy6SGCWkBtSwPYi5tv1BGKID2"),
    ("L" * 100, "$2b$12$o/Wz/s8BYxLaN2GKATOn3unOJHPwq7NkPI6qvlkIp0sMLahdCxhBK"),
]


@pytest.mark.parametrize("senha,hash_antigo", MODERNO)
def test_hashes_made_by_passlib_still_verify(senha, hash_antigo):
    # A promessa inteira da issue: ninguém perde o login.
    assert verify_password(senha, hash_antigo) is True


@pytest.mark.parametrize("senha,hash_antigo", MODERNO)
def test_a_wrong_password_is_still_refused_against_an_old_hash(senha, hash_antigo):
    assert verify_password(senha + "x", hash_antigo) is False


@pytest.mark.parametrize("senha,hash_antigo", LEGADO)
def test_legacy_plain_bcrypt_hashes_still_verify(senha, hash_antigo):
    # Estes vêm de antes do bcrypt_sha256. Continuam válidos até o próximo
    # login, quando o upgrade transparente os reescreve.
    assert verify_password(senha, hash_antigo) is True


@pytest.mark.parametrize("senha,hash_antigo", LEGADO)
def test_a_wrong_password_is_refused_against_a_legacy_hash(senha, hash_antigo):
    # Diferença no COMEÇO, de propósito: ver o teste abaixo.
    assert verify_password("x" + senha, hash_antigo) is False


def test_a_legacy_hash_cannot_tell_passwords_apart_after_72_bytes():
    """Limitação do bcrypt cru, registrada em vez de escondida.

    Ele trunca em 72 bytes sem avisar, então para um hash LEGADO uma senha de
    100 caracteres e a mesma com um caractere a mais no fim são indistinguíveis.
    O `bcrypt_sha256` existe exatamente para isto, e o `UserRegister` recusa
    senha acima de 72 bytes desde a Onda 1 — mas hashes antigos ficaram, e
    fingir que o problema não existe seria pior do que dizer onde ele está.
    """
    _senha, hash_legado = LEGADO[2]
    assert verify_password("L" * 100, hash_legado) is True
    assert verify_password("L" * 100 + "x", hash_legado) is True  # mesmo hash
    # E é por isso que estes são marcados para upgrade no próximo login.
    assert needs_update(hash_legado) is True


# --- Hash novo ---------------------------------------------------------------


def test_a_new_hash_uses_the_scheme_the_app_already_used():
    h = hash_password("secret123")
    assert h.startswith(f"$bcrypt-sha256$v=2,t=2b,r={ROUNDS}$")
    assert verify_password("secret123", h) is True
    assert verify_password("outra", h) is False


def test_two_hashes_of_the_same_password_differ():
    # Salt aleatório: sem isso, senhas iguais viram hashes iguais e o banco
    # entrega de graça quem usa a mesma senha.
    assert hash_password("secret123") != hash_password("secret123")


def test_the_72_byte_ceiling_of_raw_bcrypt_does_not_apply():
    # É para isto que o `bcrypt_sha256` existe. Duas senhas de 100 caracteres
    # que só diferem no fim TÊM de ser distinguíveis; com bcrypt cru as duas
    # dariam o mesmo hash, porque ele trunca em 72 bytes e não avisa.
    a = "L" * 99 + "a"
    b = "L" * 99 + "b"
    h = hash_password(a)
    assert verify_password(a, h) is True
    assert verify_password(b, h) is False


def test_a_unicode_password_survives_the_round_trip():
    senha = "çãé ñ 日本語 🙂"
    assert verify_password(senha, hash_password(senha)) is True


# --- Robustez ----------------------------------------------------------------


@pytest.mark.parametrize(
    "lixo",
    ["", "nao e um hash", "$bcrypt-sha256$quebrado", "$2b$12$curto", "$desconhecido$x$y"],
)
def test_a_malformed_hash_is_false_and_never_raises(lixo):
    # Uma linha corrompida no banco não pode virar 500 no login, e muito menos
    # autenticar alguém. Falso, sempre.
    assert verify_password("secret123", lixo) is False


# --- Upgrade transparente ----------------------------------------------------


@pytest.mark.parametrize("_senha,hash_antigo", LEGADO)
def test_legacy_hashes_are_marked_for_upgrade(_senha, hash_antigo):
    assert needs_update(hash_antigo) is True


@pytest.mark.parametrize("_senha,hash_antigo", MODERNO)
def test_current_hashes_are_not_marked_for_upgrade(_senha, hash_antigo):
    assert needs_update(hash_antigo) is False


def test_a_hash_with_fewer_rounds_is_marked_for_upgrade():
    # Se um dia o custo subir, os hashes velhos precisam ser reescritos no
    # login em vez de ficarem baratos para sempre.
    fraco = "$bcrypt-sha256$v=2,t=2b,r=10$tIxKLHZIE3mwNTd3gYQGI.$udqn2VQ6XXF5NvasI7wbzlj7.Ri1pPW"
    assert needs_update(fraco) is True
