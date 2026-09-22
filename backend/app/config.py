from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

class Settings(BaseSettings):
    # Banco
    database_url: str
    mongodb_url: str
    
    # Auth
    secret_key: str
    algorithm: Literal["HS256"] = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    @field_validator("secret_key")
    @classmethod
    def _rejeita_secret_key_fraca(cls, v: str) -> str:
        # #154: o placeholder do .env.example é público neste repo — quem
        # copia o template sem trocar assina JWT com uma chave que qualquer
        # leitor conhece, e forja token de qualquer usuário. Menos de 32
        # caracteres também é fraco demais pra assinatura HS256.
        if v == "mude_para_uma_chave_segura_de_32_caracteres":
            raise ValueError(
                "SECRET_KEY ainda é o placeholder do .env.example — gere uma "
                "chave real (python -c \"import secrets; print(secrets.token_urlsafe(32))\")."
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY precisa ter pelo menos 32 caracteres.")
        return v

    # #110: o refresh token viaja num cookie HttpOnly do host da API, restrito
    # a /auth. `Secure` acompanha o esquema da app: em produção é https; em
    # localhost o navegador recusaria um cookie Secure sobre http.
    refresh_cookie_name: str = "norby_refresh"

    @property
    def refresh_cookie_secure(self) -> bool:
        return self.app_base_url.startswith("https://")

    # Gemini
    gemini_api_key: str

    # CORS — origens permitidas (separadas por vírgula). Default cobre o dev local.
    cors_origins: str = "http://localhost:5173"

    @field_validator("cors_origins")
    @classmethod
    def _rejeita_wildcard_cors(cls, v: str) -> str:
        # Com allow_credentials=True (main.py), "*" faria o navegador aceitar
        # QUALQUER origem enviando credenciais — e o cookie de refresh, que só
        # devia ser lido por norby.com.br, ficaria legível por qualquer site.
        if any(origem.strip() == "*" for origem in v.split(",")):
            raise ValueError(
                "CORS_ORIGINS não pode conter '*': com allow_credentials=True "
                "isso libera qualquer origem a ler o cookie de refresh."
            )
        return v

    # Stripe (ADR 0001). Default "" DE PROPÓSITO, ao contrário de gemini_api_key:
    # torná-los obrigatórios derrubaria a produção no instante do merge, já que
    # as variáveis ainda não existem no Railway. Quem recusa segredo vazio é o
    # endpoint (503), não o boot — assim o app sobe e o billing fica desligado
    # até o #26 provisionar a conta.
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    @field_validator("stripe_webhook_secret")
    @classmethod
    def _rejeita_webhook_secret_placeholder(cls, v: str) -> str:
        # #154: o placeholder do .env.example também é público. Vazio continua
        # OK (webhook desligado, endpoint responde 503) — só o valor de
        # exemplo específico é recusado, porque com ele qualquer leitor do
        # repo assina um evento Stripe falso e credita premium_until de graça.
        if v == "whsec_test_local_only_not_a_real_secret":
            raise ValueError(
                "STRIPE_WEBHOOK_SECRET ainda é o placeholder do .env.example — "
                "use o whsec_ real do painel Stripe ou deixe vazio."
            )
        return v

    # O preço recorrente criado no painel (#26). Vazio = billing não
    # provisionado, e o endpoint de checkout recusa com 503 em vez de tentar
    # criar sessão contra um preço que não existe.
    stripe_price_id: str = ""

    # Base pública do frontend, para onde o Stripe devolve a pessoa depois do
    # Checkout e do Portal. Default do dev local: em produção vem do ambiente.
    # Não dá para derivar do CORS — aquilo é uma LISTA, e escolher um item dela
    # como destino de redirect seria adivinhação.
    app_base_url: str = "http://localhost:5173"

    # Brevo, e-mail transacional (#36). Mesmo raciocínio do Stripe: default ""
    # para o merge não derrubar produção antes da variável existir no Railway.
    # Vazio = recuperação de senha desligada, e o endpoint responde 503 em vez
    # de fingir que enviou um e-mail que ninguém vai receber.
    brevo_api_key: str = ""
    brevo_sender_email: str = "nao-responda@norby.com.br"
    brevo_sender_name: str = "Norby"
    # Validade do link de recuperação. Curta de propósito: o link chega por
    # e-mail, e caixa de e-mail comprometida é o vetor que este token abre.
    password_reset_expire_minutes: int = 30

    # /docs, /redoc e /openapi.json (issue #29). Default DESLIGADO, ao contrário
    # de quase todo flag de conveniência: esquecer a variável em produção tem de
    # deixar o estado SEGURO, não o exposto. O openapi publica todas as rotas,
    # todos os campos e todos os formatos de erro; com dinheiro de terceiro em
    # jogo, isso é mapa de graça. Em dev vem ligado pelo `.env.example`.
    docs_enabled: bool = False

    # Flag de rollout do paywall (ADR 0002). Default DESLIGADO: o merge não muda
    # nada em produção, e o paywall acende por variável de ambiente quando o
    # dono decidir. Lido SÓ dentro dos helpers de enforcement — um `if` num
    # lugar não dá pra esquecer, oito dão.
    paywall_enabled: bool = False

    # hide_input_in_errors: por padrão o Pydantic ecoa o valor recebido na
    # mensagem de erro. Sem isso, um SECRET_KEY de produção curto demais
    # aparece em texto puro no log do Railway quando o boot falha na
    # validação acima — o log vira o próprio vazamento que o validador tenta
    # evitar.
    model_config = SettingsConfigDict(
        env_file="../.env", extra="ignore", hide_input_in_errors=True
    )

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
