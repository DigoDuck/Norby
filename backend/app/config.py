from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

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

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        """Normaliza a URL do Postgres para o driver asyncpg.

        Provedores (Neon, Railway) entregam `postgresql://...` (driver
        síncrono) e às vezes com `?sslmode=require`. O SQLAlchemy async exige
        `postgresql+asyncpg://...`, e o asyncpg NÃO aceita os params estilo
        libpq (`sslmode`, `channel_binding`) na URL — eles quebram a conexão.
        Aqui trocamos o driver e removemos esses params (o SSL é ligado via
        connect_args em database.py, ver `database_ssl_required`).
        """
        parts = urlsplit(self.database_url)
        query = [
            (k, v)
            for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if k not in ("sslmode", "channel_binding")
        ]
        scheme = parts.scheme if "asyncpg" in parts.scheme else "postgresql+asyncpg"
        return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    @property
    def database_ssl_required(self) -> bool:
        """True quando a URL do provedor pede SSL (ex.: Neon usa `?sslmode=require`).

        Traduzimos esse sinal para o mecanismo do asyncpg em database.py, já que
        o `sslmode` é removido da URL. Postgres local (sem sslmode) fica False.
        """
        for key, value in parse_qsl(urlsplit(self.database_url).query):
            if key == "sslmode":
                return value not in ("disable", "allow")
        return False

@lru_cache()  # Lê o env só uma vez depois reutiliza pra melhorar a performance
def get_settings() -> Settings:
    return Settings()