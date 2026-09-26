"""Cobre o fix round 1 do #159: `_is_local_host` em `scripts/seed_demo.py`
precisa comparar o hostname exato, não fazer substring match na URL crua
("http://localhost.evil.com" continha "://localhost" e escapava do gate de
SEED_PASSWORD obrigatória fora de localhost).

`scripts/` não é um pacote (sem `__init__.py`), então carregamos o arquivo
isolado via `importlib` em vez de `import scripts.seed_demo` — evita
depender de sys.path. `SEED_PASSWORD` é setada por precaução (não é mais
lida no import desde que `_password()` passou a rodar só dentro de
`main()`, no fix wave final), mas não custa manter o teste robusto a uma
regressão nisso.

`async def` sem tocar em I/O, mesmo motivo do `test_docs_exposure.py`: o
`conftest` tem uma fixture `autouse` assíncrona que cria/derruba o schema a
cada teste, e um teste síncrono no meio da suíte quebra esse ciclo.
"""
import importlib.util
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "seed_demo.py"


def _load_seed_demo(monkeypatch, seed_api_url="http://localhost:8000"):
    monkeypatch.setenv("SEED_API_URL", seed_api_url)
    monkeypatch.setenv("SEED_PASSWORD", "senha-de-teste-fixa")  # evita sys.exit no import
    spec = importlib.util.spec_from_file_location("seed_demo_under_test", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def test_is_local_host_rejects_lookalike_domain(monkeypatch):
    module = _load_seed_demo(monkeypatch, seed_api_url="http://localhost.evil.com")
    assert module._is_local_host("http://localhost.evil.com") is False


async def test_is_local_host_accepts_real_localhost(monkeypatch):
    module = _load_seed_demo(monkeypatch)
    assert module._is_local_host("http://localhost:8000") is True
    assert module._is_local_host("http://127.0.0.1:8000") is True


async def test_a_429_waits_retry_after_and_retries_instead_of_aborting(monkeypatch):
    # POST /transactions aceita 120/min por usuário e o seed cria ~150
    # lançamentos: sem esperar o 429, a conta de demo ficava pela metade.
    import httpx

    module = _load_seed_demo(monkeypatch)
    respostas = iter([
        httpx.Response(429, headers={"Retry-After": "7"}),
        httpx.Response(201, json={"id": "criado"}),
    ])
    cliente = httpx.Client(
        base_url="http://localhost:8000",
        transport=httpx.MockTransport(lambda request: next(respostas)),
    )
    esperas = []
    monkeypatch.setattr(module.time, "sleep", esperas.append)

    resposta = module._post(cliente, "/transactions/", {"amount": "10.00"})

    assert resposta.status_code == 201
    assert esperas == [7]
