from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Banco
    database_url: str
    mongodb_url: str
    
    # Auth
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    
    # Gemini
    gemini_api_key: str

    # CORS — origens permitidas (separadas por vírgula). Default cobre o dev local.
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = "../.env"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        """Garante o driver asyncpg na URL do Postgres.

        Provedores como o Railway entregam a connection string no formato
        `postgresql://...` (driver síncrono). O SQLAlchemy async exige
        `postgresql+asyncpg://...`. Normalizamos aqui para poder colar a URL
        do provedor sem editar à mão. Mesma lógica que o Alembic (`env.py`).
        """
        url = self.database_url
        if "asyncpg" in url:
            return url
        return url.replace(
            "postgresql://", "postgresql+asyncpg://"
        ).replace(
            "postgresql+psycopg2://", "postgresql+asyncpg://"
        )

@lru_cache()  # Lê o env só uma vez depois reutiliza pra melhorar a perfomance
def get_settings() -> Settings:
    return Settings()