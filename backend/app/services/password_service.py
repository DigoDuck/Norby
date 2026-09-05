"""Hash de senha, sem passlib (issue #102).

Por que sair do passlib: ele parou em 2020, e duas consequências já batem na
porta. Prende o projeto no bcrypt 3.x — com bcrypt 5 o app **não sobe**, porque
o passlib sonda o backend com uma senha de mais de 72 bytes e o bcrypt novo
levanta em vez de truncar. E importa `crypt`, removido no Python 3.13.

O esquema NÃO muda: continua sendo o `bcrypt_sha256` do passlib, byte a byte.
Ele aplica SHA-256 antes do bcrypt, então a senha inteira conta e o teto de 72
bytes do bcrypt cru deixa de existir. Reimplementá-lo é o que permite trocar a
dependência sem forçar ninguém a redefinir a senha — os testes carregam
hashes-testemunha gerados pelo passlib para provar isso.

O formato, para quem for ler um hash no banco:

    $bcrypt-sha256$v=2,t=2b,r=12$<salt de 22 chars>$<checksum de 31 chars>

A derivação v2 é `bcrypt(base64(hmac_sha256(key=salt, msg=senha)), salt)`. A
chave do HMAC é o SALT CODIFICADO, não o config completo — o próprio passlib
escolheu assim para facilitar implementações paralelas, e esta é uma delas.
"""

import base64
import hashlib
import hmac
import secrets

import bcrypt

# Mesmo custo que o passlib usava por padrão, para os hashes existentes não
# serem marcados para upgrade sem necessidade.
ROUNDS = 12

PREFIXO = "$bcrypt-sha256$"
_IDENT = "2b"
# bcrypt gera 22 chars de salt no alfabeto próprio dele.
_SALT_CHARS = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
# O passlib recusa salt cujo último caractere tenha bits de padding ligados,
# porque implementações de bcrypt não os tratam igual. Mantido.
_FINAL_SALT_CHARS = ".Oeu"


def _checksum(senha: str, salt: str, rounds: int) -> str:
    digest = hmac.new(salt.encode("ascii"), senha.encode("utf-8"), hashlib.sha256).digest()
    config = f"${_IDENT}${rounds:02d}${salt}".encode("ascii")
    return bcrypt.hashpw(base64.b64encode(digest), config).decode("ascii")[len(config):]


def _novo_salt() -> str:
    return "".join(secrets.choice(_SALT_CHARS) for _ in range(21)) + secrets.choice(
        _FINAL_SALT_CHARS
    )


def hash_password(senha: str) -> str:
    salt = _novo_salt()
    return f"{PREFIXO}v=2,t={_IDENT},r={ROUNDS}${salt}${_checksum(senha, salt, ROUNDS)}"


def _partes(hashed: str) -> tuple[str, int] | None:
    """(salt, rounds) de um hash `bcrypt_sha256`, ou None se não for um."""
    try:
        _, esquema, params, salt, _checksum_guardado = hashed.split("$")
        if esquema != "bcrypt-sha256":
            return None
        campos = dict(p.split("=") for p in params.split(","))
        if campos.get("v") != "2":
            # v1 usava sha256 puro e nunca foi gerado por este app: o
            # CryptContext sempre criou v2. Recusar é melhor do que implementar
            # um caminho que ninguém tem e ninguém testa.
            return None
        return salt, int(campos["r"])
    except (ValueError, KeyError):
        return None


def verify_password(senha: str, hashed: str) -> bool:
    """Confere a senha contra os DOIS esquemas que existem no banco.

    Nunca levanta: uma linha corrompida não pode virar 500 no login, e muito
    menos autenticar alguém.
    """
    if not hashed:
        return False

    partes = _partes(hashed)
    if partes is not None:
        salt, rounds = partes
        try:
            calculado = _checksum(senha, salt, rounds)
        except (ValueError, TypeError):
            return False
        # compare_digest: comparação em tempo constante, para o tempo de
        # resposta não vazar quantos caracteres do checksum bateram.
        return hmac.compare_digest(calculado, hashed.rsplit("$", 1)[-1])

    # Legado: bcrypt cru, de antes do bcrypt_sha256.
    try:
        # Truncar em 72 bytes é o que o bcrypt sempre fez em silêncio, e é o
        # que esses hashes viram quando foram criados. Sem isto o bcrypt 5
        # levanta ValueError e uma senha longa e CORRETA seria recusada.
        return bcrypt.checkpw(senha.encode("utf-8")[:72], hashed.encode("ascii"))
    except (ValueError, TypeError, UnicodeEncodeError):
        return False


def needs_update(hashed: str) -> bool:
    """True quando o hash deve ser reescrito no próximo login bem-sucedido.

    Cobre o esquema legado e também custo abaixo do atual, para um aumento
    futuro de `ROUNDS` se propagar sozinho em vez de valer só para contas novas.
    """
    partes = _partes(hashed)
    if partes is None:
        return True
    _salt, rounds = partes
    return rounds < ROUNDS
