import pytest
from pydantic import ValidationError

from app.config import Settings

# Chave válida (>= 32 chars, não é o placeholder) para os testes que não
# investigam o próprio secret_key — assim cada teste falha pelo motivo que diz.
VALID_SECRET_KEY = "a-valid-test-secret-key-with-32+chars"


def test_settings_rejects_asymmetric_jwt_algorithm():
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql://localhost/norby",
            mongodb_url="mongodb://localhost/norby",
            secret_key=VALID_SECRET_KEY,
            algorithm="ES256",
            gemini_api_key="test-key",
            _env_file=None,
        )


def test_settings_rejects_wildcard_cors_origin():
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql://localhost/norby",
            mongodb_url="mongodb://localhost/norby",
            secret_key=VALID_SECRET_KEY,
            gemini_api_key="test-key",
            cors_origins="*",
            _env_file=None,
        )


def test_settings_rejects_placeholder_secret_key():
    # #154: o placeholder do .env.example é público no repo — não pode subir.
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql://localhost/norby",
            mongodb_url="mongodb://localhost/norby",
            secret_key="mude_para_uma_chave_segura_de_32_caracteres",
            gemini_api_key="test-key",
            _env_file=None,
        )


def test_settings_rejects_short_secret_key():
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql://localhost/norby",
            mongodb_url="mongodb://localhost/norby",
            secret_key="curta-demais",
            gemini_api_key="test-key",
            _env_file=None,
        )


def test_settings_rejects_placeholder_webhook_secret():
    # #154: mesmo raciocínio do secret_key, para o segredo do webhook Stripe.
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql://localhost/norby",
            mongodb_url="mongodb://localhost/norby",
            secret_key=VALID_SECRET_KEY,
            gemini_api_key="test-key",
            stripe_webhook_secret="whsec_test_local_only_not_a_real_secret",
            _env_file=None,
        )


def test_settings_accepts_valid_secret_key_and_empty_webhook_secret():
    # Vazio continua OK: billing desligado, endpoint responde 503 (não é
    # placeholder, é "ainda não configurado").
    settings = Settings(
        database_url="postgresql://localhost/norby",
        mongodb_url="mongodb://localhost/norby",
        secret_key=VALID_SECRET_KEY,
        gemini_api_key="test-key",
        stripe_webhook_secret="",
        _env_file=None,
    )
    assert settings.secret_key == VALID_SECRET_KEY
    assert settings.stripe_webhook_secret == ""
