from sqlmodel import SQLModel, Session, create_engine
from backend.app.core.config import settings

# Since SQLite might be in memory, we should allow checking if DATABASE_URL starts with sqlite
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)

def create_db_and_tables():
    # Make sure we import entities so that they register on SQLModel.metadata
    from backend.app.models.entities import TransactionRecord, AuditLedgerEntry
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
