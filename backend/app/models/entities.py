from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class TransactionRecord(SQLModel, table=True):
    __tablename__ = "transaction_records"
    
    id: Optional[str] = Field(default=None, primary_key=True)
    amount: float
    currency: str
    rail: str
    bank: str
    error_code: Optional[str] = None
    status: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AuditLedgerEntry(SQLModel, table=True):
    __tablename__ = "audit_ledger"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    tx_id: str
    stage: str
    input_state: str
    output_state: str
    compliance_stamp: str
    block_hash: str
    previous_hash: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
