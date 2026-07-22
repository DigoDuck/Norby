import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_rejects_asymmetric_jwt_algorithm():
    with pytest.raises(ValidationError):
        Settings(
            database_url="postgresql://localhost/norby",
            mongodb_url="mongodb://localhost/norby",
            secret_key="test-secret",
            algorithm="ES256",
            gemini_api_key="test-key",
            _env_file=None,
        )
