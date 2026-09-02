from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Dict, Any

from backend.app.core.database import get_session
from backend.app.models.entities import TransactionRecord, AuditLedgerEntry
from backend.app.models.schemas import TransactionPayload, PaymentRail, JurisdictionCode, ActionType
from backend.app.engine.telemetry_tracker import telemetry_tracker
from backend.app.engine.diagnoser import diagnose_failure
from backend.app.engine.llm_strategist import generate_recovery_strategy
from backend.app.guardrails.gatekeeper import ComplianceGatekeeper
from backend.app.guardrails.policy_loader import policy_loader
from backend.app.core.security import generate_block_hash
import json
from datetime import datetime, timezone

router = APIRouter()
gatekeeper = ComplianceGatekeeper(policy_loader)

@router.get("/transactions")
async def list_transactions(db: Session = Depends(get_session)):
    """
    Returns a list of all transactions stored in the database.
    """
    transactions = db.exec(select(TransactionRecord).order_by(TransactionRecord.created_at.desc())).all()
    return transactions

@router.get("/transactions/{tx_id}")
async def get_transaction(tx_id: str, db: Session = Depends(get_session)):
    """
    Returns details of a specific transaction along with its audit logs.
    """
    tx = db.get(TransactionRecord, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    audit_logs = db.exec(
        select(AuditLedgerEntry).where(AuditLedgerEntry.tx_id == tx_id).order_by(AuditLedgerEntry.timestamp.desc())
    ).all()
    
    # Parse output_state in audit logs if possible to return rich details
    parsed_logs = []
    for log in audit_logs:
        log_data = log.model_dump()
        try:
            log_data["output_state"] = json.loads(log.output_state)
            log_data["input_state"] = json.loads(log.input_state)
        except Exception:
            pass
        parsed_logs.append(log_data)

    return {
        "transaction": tx,
        "audit_trail": parsed_logs
    }

@router.post("/retry/{tx_id}")
async def trigger_manual_retry(tx_id: str, db: Session = Depends(get_session)):
    """
    Manually triggers a retry attempt for a failed transaction.
    This simulates a new payment failure webhook with incremented retry count.
    """
    tx = db.get(TransactionRecord, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Fetch previous audit logs to count retries
    audit_logs = db.exec(
        select(AuditLedgerEntry).where(AuditLedgerEntry.tx_id == tx_id)
    ).all()
    retry_count = len(audit_logs)

    # Determine jurisdiction from currency or notes (default IN_RBI)
    jurisdiction = JurisdictionCode.IN_RBI
    if tx.currency == "USD":
        jurisdiction = JurisdictionCode.US_NACHA
    elif tx.currency == "EUR":
        jurisdiction = JurisdictionCode.EU_PSD3

    # Build TransactionPayload incrementing retry count
    payload = TransactionPayload(
        id=tx.id,
        amount=tx.amount,
        currency=tx.currency,
        rail=PaymentRail(tx.rail.upper()),
        bank=tx.bank,
        error_code=tx.error_code or "UNKNOWN",
        retry_count=retry_count,
        jurisdiction=jurisdiction
    )

    # Run compliance pipeline
    bank_health = telemetry_tracker.get_bank_health(payload.bank)
    health_pct = bank_health["switch_health_pct"]
    diagnosis = diagnose_failure(payload.error_code, payload.rail.value, payload.bank)
    proposal = generate_recovery_strategy(payload, diagnosis)
    gated_action = gatekeeper.evaluate(proposal, payload, health_pct)

    # Update database record
    tx.status = gated_action.action.value
    db.add(tx)
    db.commit()

    # Append to cryptographic Audit Ledger
    prev_entry = db.exec(
        select(AuditLedgerEntry).order_by(AuditLedgerEntry.id.desc())
    ).first()
    
    previous_hash = prev_entry.block_hash if prev_entry else "0" * 64
    timestamp_str = str(datetime.now(timezone.utc))

    input_state_str = json.dumps({
        "transaction": payload.model_dump(mode="json"),
        "diagnosis": diagnosis.model_dump(mode="json"),
        "proposal": proposal.model_dump(mode="json")
    })
    output_state_str = json.dumps(gated_action.model_dump(mode="json"))

    block_hash = generate_block_hash(
        prev_hash=previous_hash,
        tx_id=payload.id,
        state=output_state_str,
        timestamp=timestamp_str
    )

    ledger_entry = AuditLedgerEntry(
        tx_id=payload.id,
        stage="MANUAL_RETRY_EVALUATION",
        input_state=input_state_str,
        output_state=output_state_str,
        compliance_stamp=gated_action.compliance_stamp,
        block_hash=block_hash,
        previous_hash=previous_hash,
        timestamp=datetime.now(timezone.utc)
    )
    
    db.add(ledger_entry)
    db.commit()

    return gated_action
