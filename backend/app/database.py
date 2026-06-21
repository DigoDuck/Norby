from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings

settings = get_settings()

# PostgreSQL
engine = create_async_engine(
    settings.database_url,
    echo=False,  # True em desenvolvimento pra ver SQL no terminal para debugar
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

class Base(DeclarativeBase):
    pass

# MongoDB
mongo_client = AsyncIOMotorClient(settings.mongodb_url)
mongo_db = mongo_client["norby_db"]

# Collections
ai_insights_collection = mongo_db["ai_insights"]
chat_history_collection = mongo_db["chat_history"]