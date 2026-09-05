import asyncio
import random
import time
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select, col

from backend.app.core.database import engine
from backend.app.core.security import generate_block_hash
from backend.app.models.entities import TransactionRecord, AuditLedgerEntry
from backend.app.models.schemas import (
    TransactionPayload, PaymentRail, JurisdictionCode, ActionType
)
from backend.app.engine.telemetry_tracker import telemetry_tracker
from backend.app.engine.diagnoser import diagnose_failure
from backend.app.engine.llm_strategist import generate_recovery_strategy
from backend.app.guardrails.gatekeeper import ComplianceGatekeeper
from backend.app.guardrails.policy_loader import policy_loader

router = APIRouter()
gatekeeper = ComplianceGatekeeper(policy_loader)

# Realistic customer & failure pool mirroring benchmark and mockData
CUSTOMERS = [
    ("cust_101", "Acme Retail Corp"),
    ("cust_102", "Nova Cloud Ltd"),
    ("cust_103", "Apex Logistics"),
    ("cust_104", "Quantum FinTech"),
    ("cust_105", "Starlight Media"),
    ("cust_106", "Zenith Commerce"),
    ("cust_107", "Hyperion Dynamics"),
    ("cust_108", "Vortex Payments"),
    ("cust_109", "Karan Johar"),
    ("cust_110", "Neha Sharma"),
    ("cust_111", "Robert Vance"),
    ("cust_112", "Sophia Loren"),
]

SCENARIOS = [
    # IN_RBI Scenarios
    {
        "jurisdiction": JurisdictionCode.IN_RBI,
        "currency": "INR",
        "banks": ["HDFC", "SBI", "ICICI", "AXIS"],
        "rail": PaymentRail.UPI,
        "error_code": "BAD_REQUEST_TIMEOUT",
        "amount_range": (500, 25000),
    },
    {
        "jurisdiction": JurisdictionCode.IN_RBI,
        "currency": "INR",
        "banks": ["HDFC", "SBI", "ICICI"],
        "rail": PaymentRail.UPI,
        "error_code": "SWITCH_OFFLINE",
        "amount_range": (1200, 15000),
    },
    {
        "jurisdiction": JurisdictionCode.IN_RBI,
        "currency": "INR",
        "banks": ["ICICI", "HDFC", "AXIS"],
        "rail": PaymentRail.CARD,
        "error_code": "INSUFFICIENT_FUNDS",
        "amount_range": (800, 35000),
    },
    {
        "jurisdiction": JurisdictionCode.IN_RBI,
        "currency": "INR",
        "banks": ["HDFC", "SBI"],
        "rail": PaymentRail.MANDATE,
        "error_code": "LIMIT_EXCEEDED",
        "amount_range": (16000, 75000),  # Exceeds RBI 15k e-mandate AFA limit
    },
    {
        "jurisdiction": JurisdictionCode.IN_RBI,
        "currency": "INR",
        "banks": ["ICICI", "AXIS"],
        "rail": PaymentRail.UPI,
        "error_code": "NETWORK_CONGESTION",
        "amount_range": (450, 8500),
    },
    # US_NACHA Scenarios
    {
        "jurisdiction": JurisdictionCode.US_NACHA,
        "currency": "USD",
        "banks": ["CHASE"],
        "rail": PaymentRail.MANDATE,
        "error_code": "R01",  # NSF
        "amount_range": (150, 4500),
    },
    {
        "jurisdiction": JurisdictionCode.US_NACHA,
        "currency": "USD",
        "banks": ["CHASE"],
        "rail": PaymentRail.CARD,
        "error_code": "VELOCITY_REJECTED",
        "amount_range": (500, 12000),
    },
    {
        "jurisdiction": JurisdictionCode.US_NACHA,
        "currency": "USD",
        "banks": ["CHASE"],
        "rail": PaymentRail.MANDATE,
        "error_code": "R05",  # Unauthorized debit (strictly halted)
        "amount_range": (200, 3200),
    },
    # EU_PSD3 Scenarios
    {
        "jurisdiction": JurisdictionCode.EU_PSD3,
        "currency": "EUR",
        "banks": ["BARCLAYS"],
        "rail": PaymentRail.CARD,
        "error_code": "SOFT_DECLINE_SCA_REQUIRED",
        "amount_range": (50, 2400),
    },
    {
        "jurisdiction": JurisdictionCode.EU_PSD3,
        "currency": "EUR",
        "banks": ["BARCLAYS"],
        "rail": PaymentRail.MANDATE,
        "error_code": "LIMIT_EXCEEDED",
        "amount_range": (600, 5000),  # Exceeds PSD3 500 EUR mandate cap
    },
]

_id_seq = 9900

def generate_and_process_failure() -> Dict[str, Any]:
    """
    Synthesizes a plausible transaction failure, runs it synchronously through the
    complete Sentinel pipeline:
      1. Diagnoser (telemetry + root cause analysis)
      2. LLM Strategist (Gemini AI with deterministic fallback)
      3. Compliance Gatekeeper (Jurisdiction rule enforcement FSM)
      4. Database persistence (TransactionRecord + hash-chained AuditLedgerEntry)
    Returns a frontend-compatible Transaction object packet.
    """
    global _id_seq
    _id_seq += 1
    tx_id = f"txn_{_id_seq}"
    
    # 1. Synthesize scenario
    scenario = random.choice(SCENARIOS)
    cust_id, cust_name = random.choice(CUSTOMERS)
    bank = random.choice(scenario["banks"])
    rail = scenario["rail"]
    jur = scenario["jurisdiction"]
    currency = scenario["currency"]
    error_code = scenario["error_code"]
    min_amt, max_amt = scenario["amount_range"]
    amount = float(random.randint(min_amt, max_amt))
    retry_count = 0
    
    # If error is R01 in NACHA, occasionally test a higher retry count
    if error_code == "R01" and random.random() < 0.4:
        retry_count = 3  # Triggers NACHA_NSF_LIMIT_R01 HALT

    transaction = TransactionPayload(
        id=tx_id,
        amount=amount,
        currency=currency,
        rail=rail,
        bank=bank,
        error_code=error_code,
        retry_count=retry_count,
        jurisdiction=jur,
        metadata={"customer_id": cust_id, "customer_name": cust_name}
    )

    # 2. Query bank telemetry
    bank_health = telemetry_tracker.get_bank_health(bank)
    health_pct = float(bank_health["switch_health_pct"])

    # 3. Diagnose failure
    diagnosis = diagnose_failure(transaction.error_code, transaction.rail.value, transaction.bank)

    # 4. Generate AI strategy (Gemini LLM or deterministic fallback)
    proposal = generate_recovery_strategy(transaction, diagnosis)

    # 5. Evaluate Compliance Gatekeeper FSM
    gated_action = gatekeeper.evaluate(proposal, transaction, health_pct)

    # 6. Database Storage & Cryptographic Audit Ledger Entry
    with Session(engine) as db:
        # Save Transaction Record
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
            db.add(tx_record)
        db.commit()

        # Previous ledger hash
        prev_entry = db.exec(
            select(AuditLedgerEntry).order_by(col(AuditLedgerEntry.id).desc())
        ).first()
        previous_hash = prev_entry.block_hash if prev_entry else "0" * 64
        timestamp_str = str(datetime.now(timezone.utc))

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
            timestamp=datetime.now(timezone.utc)
        )
        db.add(ledger_entry)
        db.commit()

    # 7. Map to exact frontend Transaction shape
    is_halted = (gated_action.action == ActionType.HALT)
    if is_halted:
        compliance_status = "HALTED"
        status_str = "FAILED_PERMANENTLY"
    elif gated_action.is_overridden:
        compliance_status = "OVERRIDDEN"
        status_str = "FAILED"
    else:
        compliance_status = "PASSED_CLEAN"
        status_str = "FAILED"

    cooling_hours = (
        round(gated_action.execution_delay_minutes / 60.0, 1)
        if gated_action.execution_delay_minutes
        else 0
    )

    override_reason = (
        gated_action.sanitized_reason
        if (gated_action.is_overridden or is_halted)
        else "Proposal satisfies all compliance rules under the selected jurisdiction. Approved for immediate dispatch."
    )

    frontend_tx = {
        "id": transaction.id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "amount": transaction.amount,
        "currency": transaction.currency,
        "paymentRail": transaction.rail.value,
        "errorCode": transaction.error_code,
        "errorMessage": diagnosis.root_cause,
        "bankTelemetry": {
            "bankName": transaction.bank,
            "switchHealthPct": int(bank_health["switch_health_pct"]),
            "latencyMs": int(bank_health.get("latency_ms", 50)),
            "status": bank_health.get("status", "HEALTHY")
        },
        "aiDiagnosis": {
            "rootCause": proposal.root_cause or diagnosis.root_cause,
            "confidenceScore": int((proposal.confidence or 0.85) * 100),
            "proposedAction": proposal.proposed_action.value,
            "suggestedDelayMinutes": proposal.delay_minutes
        },
        "complianceResult": {
            "status": compliance_status,
            "ruleViolated": gated_action.override_rule,
            "sanitizedAction": gated_action.sanitized_reason or gated_action.action.value,
            "overrideReason": override_reason,
            "coolingPeriodHours": cooling_hours,
            "complianceStamp": gated_action.compliance_stamp
        },
        "status": status_str,
        "customerId": cust_id,
        "customerName": cust_name,
        "retryCount": transaction.retry_count,
        "maxRetriesAllowed": 3
    }

    return {
        "type": "NEW_FAILURE",
        "data": frontend_tx,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._lock = asyncio.Lock()
        self._broadcast_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)
            if self._broadcast_task is None or self._broadcast_task.done():
                self._broadcast_task = asyncio.create_task(self._generator_loop())
        print(f"[WebSocket] Client connected. Total active: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
            if not self.active_connections and self._broadcast_task and not self._broadcast_task.done():
                self._broadcast_task.cancel()
                self._broadcast_task = None
        print(f"[WebSocket] Client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        async with self._lock:
            connections = list(self.active_connections)
        
        disconnected = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        if disconnected:
            async with self._lock:
                for conn in disconnected:
                    if conn in self.active_connections:
                        self.active_connections.remove(conn)
                if not self.active_connections and self._broadcast_task and not self._broadcast_task.done():
                    self._broadcast_task.cancel()
                    self._broadcast_task = None

    async def _generator_loop(self):
        """
        Background loop executing while at least one WebSocket client is connected.
        Pushes a real processed transaction failure every 3 to 6 seconds.
        """
        print("[WebSocket] Starting background live failure generation loop.")
        try:
            while True:
                delay = random.uniform(3.0, 6.0)
                await asyncio.sleep(delay)

                async with self._lock:
                    if not self.active_connections:
                        break

                try:
                    # Run CPU/network/DB work in worker thread so event loop never blocks
                    packet = await asyncio.to_thread(generate_and_process_failure)
                    await self.broadcast(packet)
                except Exception as e:
                    print(f"[WebSocket Engine Error] {e}", flush=True)

        except asyncio.CancelledError:
            print("[WebSocket] Background live failure generator cancelled (no active clients).")
        except Exception as e:
            print(f"[WebSocket] Generator loop terminated with error: {e}", flush=True)


manager = ConnectionManager()


@router.websocket("/ws/failures")
async def failures_websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint streaming live failed transaction events through the
    Sentinel diagnosis -> AI -> Gatekeeper -> Audit ledger pipeline.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Keep socket alive and respond to client disconnects
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)
