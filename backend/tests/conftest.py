import os
import uuid

import pytest
import pytest_asyncio
from dotenv import load_dotenv
from httpx import AsyncClient, ASGITransport
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.database import Base
from app.dependencies import get_db
from app.limiter import limiter

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"), encoding="utf-8")

_base = os.environ["DATABASE_URL"]  # ex: postgresql+asyncpg://norby_user:...@localhost:5432/norby_db
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL") or _base.replace("/norby_db", "/norby_test")

test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(autouse=True)
def disable_rate_limit():
    # O limiter (5/min em /register) derrubaria a suíte com 429. Desliga nos testes.
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    # Schema limpo por teste: cria tudo antes, derruba tudo depois.
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def _override_get_db():
    async def _get():
        async with TestSessionLocal() as session:
            yield session
    return _get


@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    app.dependency_overrides[get_db] = _override_get_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def make_auth_client():
    app.dependency_overrides[get_db] = _override_get_db()
    created = []

    async def _make(name="User"):
        transport = ASGITransport(app=app)
        ac = AsyncClient(transport=transport, base_url="http://test")
        email = f"{name.lower()}_{uuid.uuid4().hex[:8]}@test.com"
        res = await ac.post(
            "/auth/register",
            json={"name": name, "email": email, "password": "secret123"},
        )
        assert res.status_code == 201, res.text
        ac.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
        created.append(ac)
        return ac

    yield _make
    for ac in created:
        await ac.aclose()
    app.dependency_overrides.pop(get_db, None)
