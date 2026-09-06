"""A superfície de documentação da API (issue #29).

O `/openapi.json` publica todas as rotas, todos os campos de todos os schemas e
todos os formatos de erro. Enquanto o Norby não cobrava, isso era conveniência.
Com dinheiro e dado financeiro de terceiros, virou mapa entregue de graça. E
fechar o repositório NÃO resolveria: o endpoint é servido em produção,
independente de o código ser público ou não.

Os dois testes guardam coisas diferentes. O primeiro trava o DEFAULT, que é
onde mora a segurança de verdade. O segundo trava a LIGAÇÃO entre a variável e
o app, que é o que um refactor quebra sem perceber.

Por que são `async` sem tocar em I/O: o `conftest` tem uma fixture `autouse`
assíncrona que cria e derruba o schema a cada teste. Um teste síncrono no meio
da suíte não fecha o ciclo dela, o `drop_all` não roda, e o teste SEGUINTE
morre em `CREATE TYPE ... already exists`. O sintoma aparece longe da causa,
então não "simplifique" isto para `def`.
"""

import pytest

from app.config import Settings
from app.main import app, settings


def _settings_limpo(**extra) -> Settings:
    """Settings sem ler o `.env`, senão o teste mede a máquina de quem roda."""
    return Settings(
        database_url="postgresql://localhost/norby",
        mongodb_url="mongodb://localhost/norby",
        secret_key="test-secret",
        gemini_api_key="test-key",
        _env_file=None,
        **extra,
    )


@pytest.mark.asyncio
async def test_docs_are_closed_unless_someone_asks_for_them():
    # ESTE é o teste que importa. Se alguém trocar o default para `True`
    # achando que "documentação aberta é boa prática", produção volta a expor
    # o schema inteiro no primeiro deploy, sem ninguém mudar variável nenhuma
    # e sem nada falhar em lugar algum. O default é a única defesa contra o
    # esquecimento, porque a variável não existe no Railway de propósito.
    assert _settings_limpo().docs_enabled is False
    assert _settings_limpo(docs_enabled=True).docs_enabled is True


@pytest.mark.asyncio
async def test_the_setting_actually_reaches_the_app():
    # Um default seguro não serve de nada se o `FastAPI(...)` ignorar a
    # variável. Os três precisam concordar com ela nos dois sentidos: ligada,
    # existem; desligada, somem.
    ligado = settings.docs_enabled

    assert (app.openapi_url is not None) is ligado
    assert (app.docs_url is not None) is ligado
    assert (app.redoc_url is not None) is ligado

    # E o schema continua sendo gerado em memória com a rota fechada, que é o
    # que permite aos testes de contrato lerem `app.openapi()` sem HTTP.
    assert app.openapi()["paths"]
