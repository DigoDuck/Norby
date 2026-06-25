import pytest


@pytest.mark.asyncio
async def test_health(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_db_roundtrip(db_session):
    from sqlalchemy import text
    result = await db_session.execute(text("SELECT 1"))
    assert result.scalar_one() == 1
