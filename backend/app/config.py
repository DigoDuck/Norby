from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Banco
    database_url: str
    mongodb_url: str
    
    # Auth
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    
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

@lru_cache()  # Lê o env só uma vez depois reutiliza pra melhorar a perfomance
def get_settings() -> Settings:
    return Settings()