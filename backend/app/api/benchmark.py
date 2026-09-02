from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
import os
import json
from datetime import datetime, timezone
from typing import Dict, Any, List

from backend.app.core.database import get_session
from backend.app.core.security import generate_block_hash
from backend.app.models.entities import TransactionRecord, AuditLedgerEntry
from backend.app.models.schemas import TransactionPayload, AIProposal, PaymentRail, JurisdictionCode, ActionType, GatekeeperStatus
from backend.app.engine.telemetry_tracker import telemetry_tracker
from backend.app.engine.diagnoser import diagnose_failure
from backend.app.guardrails.gatekeeper import ComplianceGatekeeper
from backend.app.guardrails.policy_loader import policy_loader

router = APIRouter()
gatekeeper = ComplianceGatekeeper(policy_loader)

@router.post("/run")
async def run_benchmark(db: Session = Depends(get_session)):
    """
    Loads the 50-case benchmark dataset from tests/benchmark_50_cases.json,
    pipes each transaction through the Diagnoser -> Gatekeeper pipeline,
    computes aggregated metrics, and saves results to DB.
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # tests/ is adjacent to app/
    benchmark_path = os.path.join(current_dir, "..", "..", "tests", "benchmark_50_cases.json")
    
    if not os.path.exists(benchmark_path):
        raise HTTPException(status_code=404, detail="Benchmark dataset file not found")

    try:
        with open(benchmark_path, "r", encoding="utf-8") as f:
            cases = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse benchmark dataset: {e}")

    total_cases = len(cases)
    overrides_applied = 0
    halted_count = 0
    compliance_violations = 0
    passed_clean_count = 0
    results = []

    # Reset telemetry tracker to healthy defaults first
    telemetry_tracker.reset_all()

    for idx, case in enumerate(cases):
        payload_data = case["payload"]
        ai_proposal_data = case["ai_proposal"]
        bank_health = float(case.get("bank_health_pct", 100.0))

        # Build objects
        rail = PaymentRail(payload_data["rail"].upper())
        jur = JurisdictionCode(payload_data["jurisdiction"].upper())
        
        transaction = TransactionPayload(
            id=str(payload_data["id"]),
            amount=float(payload_data["amount"]),
            currency=str(payload_data["currency"]),
            rail=rail,
            bank=str(payload_data["bank"]),
            error_code=str(payload_data["error_code"]),
            retry_count=int(payload_data["retry_count"]),
            jurisdiction=jur
        )
        
        proposal = AIProposal(
            root_cause=str(ai_proposal_data["root_cause"]),
            confidence=float(ai_proposal_data["confidence"]),
            proposed_action=ActionType(ai_proposal_data["proposed_action"].upper()),
            delay_minutes=int(ai_proposal_data["delay_minutes"]),
            reasoning=str(ai_proposal_data["reasoning"])
        )

        # Set simulated bank health for the bank
        telemetry_tracker.set_bank_health(transaction.bank, bank_health)

        # 1. Failure diagnosis
        diagnosis = diagnose_failure(transaction.error_code, transaction.rail.value, transaction.bank)

        # 2. Gatekeeper compliance validation
        gated_action = gatekeeper.evaluate(proposal, transaction, bank_health)

        # Update metrics
        if gated_action.is_overridden:
            overrides_applied += 1
        if gated_action.action == ActionType.HALT:
            halted_count += 1
        else:
            passed_clean_count += 1

        # Check if validation matches expectation
        expected_act = ActionType(case["expected_action"].upper())
        expected_status = GatekeeperStatus(case["expected_status"].upper())
        
        # A compliance violation occurs if the actual action is unsafe/unmatched,
        # but because our deterministic rules always run, any discrepancy from the expected
        # regulatory outcome would count as a validation/compliance check failure.
        is_correct = (gated_action.action == expected_act)
        if not is_correct:
            compliance_violations += 1

        # Update DB transaction record
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

        # Write block chaining entries to AuditLedgerEntry
        prev_entry = db.exec(
            select(AuditLedgerEntry).order_by(AuditLedgerEntry.id.desc())
        ).first()
        
        previous_hash = prev_entry.block_hash if prev_entry else "0" * 64
        timestamp_str = str(datetime.now(timezone.utc))

        input_state_str = json.dumps({
            "transaction": transaction.model_dump(mode="json"),
            "diagnosis": diagnosis.model_dump(mode="json"),
            "proposal": proposal.model_dump(mode="json")
        })
        output_state_str = json.dumps(gated_action.model_dump(mode="json"))

        block_hash = generate_block_hash(
            prev_hash=previous_hash,
            tx_id=transaction.id,
            state=output_state_str,
            timestamp=timestamp_str
        )

        ledger_entry = AuditLedgerEntry(
            tx_id=transaction.id,
            stage="BENCHMARK_RUN",
            input_state=input_state_str,
            output_state=output_state_str,
            compliance_stamp=gated_action.compliance_stamp,
            block_hash=block_hash,
            previous_hash=previous_hash,
            timestamp=datetime.now(timezone.utc)
        )
        db.add(ledger_entry)
        db.commit()

        results.append({
            "case_id": transaction.id,
            "description": case["description"],
            "proposal": proposal.model_dump(),
            "gated_action": gated_action.model_dump(),
            "validation_correct": is_correct
        })

    # Reset telemetry tracker to healthy defaults after run
    telemetry_tracker.reset_all()

    recovered_pct = ((total_cases - halted_count) / total_cases) * 100.0

    return {
        "summary": {
            "total_processed": total_cases,
            "recovered_pct": round(recovered_pct, 2),
            "overrides_applied": overrides_applied,
            "compliance_violations": compliance_violations,
            "zero_compliance_violations": (compliance_violations == 0)
        },
        "results": results
    }
