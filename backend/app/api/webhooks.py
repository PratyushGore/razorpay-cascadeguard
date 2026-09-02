from fastapi import APIRouter, Request, Header, HTTPException, Depends
from sqlmodel import Session, select
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import json

from backend.app.core.config import settings
from backend.app.core.database import get_session
from backend.app.core.security import verify_razorpay_signature, generate_block_hash
from backend.app.models.schemas import (
    TransactionPayload, PaymentRail, JurisdictionCode, 
    AIProposal, GatedAction, ActionType
)
from backend.app.models.entities import TransactionRecord, AuditLedgerEntry
from backend.app.engine.telemetry_tracker import telemetry_tracker
from backend.app.engine.diagnoser import diagnose_failure
from backend.app.engine.llm_strategist import generate_recovery_strategy
from backend.app.guardrails.gatekeeper import ComplianceGatekeeper
from backend.app.guardrails.policy_loader import policy_loader

router = APIRouter()
gatekeeper = ComplianceGatekeeper(policy_loader)

def extract_transaction_details(data: Dict[str, Any]) -> TransactionPayload:
    """
    Parses flat JSON or nested Razorpay payload and maps to TransactionPayload.
    """
    # 1. Check if it's flat payload
    if "id" in data and "amount" in data and "rail" in data:
        # Convert string to enum
        rail_str = str(data["rail"]).upper()
        if rail_str == "UPI":
            rail = PaymentRail.UPI
        elif rail_str == "CARD":
            rail = PaymentRail.CARD
        elif rail_str in ("MANDATE", "RECURRING"):
            rail = PaymentRail.MANDATE
        else:
            rail = PaymentRail.NETBANKING

        jur_str = str(data.get("jurisdiction", "IN_RBI")).upper()
        if jur_str == "US_NACHA":
            jur = JurisdictionCode.US_NACHA
        elif jur_str == "EU_PSD3":
            jur = JurisdictionCode.EU_PSD3
        else:
            jur = JurisdictionCode.IN_RBI

        return TransactionPayload(
            id=str(data["id"]),
            amount=float(data["amount"]),
            currency=str(data.get("currency", "INR")),
            rail=rail,
            bank=str(data.get("bank", "HDFC")),
            error_code=str(data.get("error_code", "UNKNOWN")),
            retry_count=int(data.get("retry_count", 0)),
            jurisdiction=jur,
            metadata=data.get("metadata")
        )

    # 2. Otherwise assume Razorpay nested webhook structure
    payload = data.get("payload", {})
    payment = payload.get("payment", {})
    entity = payment.get("entity", {})

    pay_id = entity.get("id") or data.get("id") or "tx_unknown"
    
    # Razorpay amount is in paise (divide by 100)
    raw_amount = entity.get("amount")
    amount = float(raw_amount) / 100.0 if raw_amount is not None else 0.0
    
    currency = entity.get("currency") or "INR"
    
    method = entity.get("method") or "card"
    method_upper = str(method).upper()
    if "UPI" in method_upper:
        rail = PaymentRail.UPI
    elif "CARD" in method_upper:
        rail = PaymentRail.CARD
    elif "MANDATE" in method_upper or "RECURRING" in method_upper:
        rail = PaymentRail.MANDATE
    else:
        rail = PaymentRail.NETBANKING

    bank = entity.get("bank") or "HDFC"
    error_code = entity.get("error_code") or "UNKNOWN"
    
    # Try to extract retry count from notes or metadata if present
    notes = entity.get("notes", {})
    retry_count = int(notes.get("retry_count") or data.get("retry_count") or 0)
    
    jur_val = notes.get("jurisdiction") or data.get("jurisdiction") or "IN_RBI"
    jur_upper = str(jur_val).upper()
    if "US" in jur_upper or "NACHA" in jur_upper:
        jur = JurisdictionCode.US_NACHA
    elif "EU" in jur_upper or "PSD" in jur_upper:
        jur = JurisdictionCode.EU_PSD3
    else:
        jur = JurisdictionCode.IN_RBI

    return TransactionPayload(
        id=str(pay_id),
        amount=amount,
        currency=str(currency),
        rail=rail,
        bank=str(bank),
        error_code=str(error_code),
        retry_count=retry_count,
        jurisdiction=jur,
        metadata=entity.get("notes") or notes
    )

@router.post("/razorpay")
async def handle_razorpay_webhook(
    request: Request,
    signature: Optional[str] = Header(None, alias="X-Razorpay-Signature"),
    db: Session = Depends(get_session)
):
    body = await request.body()
    body_str = body.decode("utf-8")
    
    # Validate signature if present
    if signature and settings.SECRET_KEY:
        is_valid = verify_razorpay_signature(body_str, signature, settings.SECRET_KEY)
        if not is_valid:
            raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        data = json.loads(body_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # 1. Parse and extract payload
    transaction = extract_transaction_details(data)

    # 2. Get bank health
    bank_health = telemetry_tracker.get_bank_health(transaction.bank)
    health_pct = bank_health["switch_health_pct"]

    # 3. Diagnose failure
    diagnosis = diagnose_failure(transaction.error_code, transaction.rail.value, transaction.bank)

    # 4. Generate LLM Strategy
    proposal = generate_recovery_strategy(transaction, diagnosis)

    # 5. Evaluate Compliance Gatekeeper
    gated_action = gatekeeper.evaluate(proposal, transaction, health_pct)

    # 6. Database Storage (Transaction Record)
    tx_record = db.get(TransactionRecord, transaction.id)
    if not tx_record:
        tx_record = TransactionRecord(
            id=transaction.id,
            amount=transaction.amount,
            currency=transaction.currency,
            rail=transaction.rail.value,
            bank=transaction.bank,
            error_code=transaction.error_code,
            status=gated_action.action.value,
            created_at=datetime.now(timezone.utc)
        )
        db.add(tx_record)
    else:
        tx_record.status = gated_action.action.value
        tx_record.error_code = transaction.error_code
        db.add(tx_record)
    
    db.commit()

    # 7. Write to Audit Ledger with cryptographic chain integrity
    # Retrieve previous block hash
    prev_entry = db.exec(
        select(AuditLedgerEntry).order_by(AuditLedgerEntry.id.desc())
    ).first()
    
    previous_hash = prev_entry.block_hash if prev_entry else "0" * 64
    timestamp_str = str(datetime.now(timezone.utc))

    # Serialize states for block hashing
    input_state_dict = {
        "transaction": transaction.model_dump(mode="json"),
        "diagnosis": diagnosis.model_dump(mode="json"),
        "proposal": proposal.model_dump(mode="json")
    }
    input_state_str = json.dumps(input_state_dict)
    output_state_str = json.dumps(gated_action.model_dump(mode="json"))

    block_hash = generate_block_hash(
        prev_hash=previous_hash,
        tx_id=transaction.id,
        state=output_state_str,
        timestamp=timestamp_str
    )

    ledger_entry = AuditLedgerEntry(
        tx_id=transaction.id,
        stage="GATEKEEPER_EVALUATION",
        input_state=input_state_str,
        output_state=output_state_str,
        compliance_stamp=gated_action.compliance_stamp,
        block_hash=block_hash,
        previous_hash=previous_hash,
        timestamp=datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f%z") if "." in timestamp_str else datetime.now(timezone.utc)
    )
    
    db.add(ledger_entry)
    db.commit()

    return gated_action
