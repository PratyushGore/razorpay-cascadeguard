import pytest
from datetime import datetime, timezone
from sqlmodel import Session, SQLModel, create_engine

from backend.app.models.schemas import (
    AIProposal, TransactionPayload, GatedAction, 
    ActionType, GatekeeperStatus, PaymentRail, JurisdictionCode
)
from backend.app.models.entities import TransactionRecord, AuditLedgerEntry
from backend.app.guardrails.policy_loader import PolicyLoader
from backend.app.guardrails.gatekeeper import ComplianceGatekeeper
from backend.app.core.security import generate_block_hash, verify_razorpay_signature

# Setup an in-memory SQLModel database for testing database storage and chaining
@pytest.fixture(name="db_session")
def db_session_fixture():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

@pytest.fixture(name="gatekeeper")
def gatekeeper_fixture():
    # Use policy loader which loads from the YAML files in guardrails/rules
    loader = PolicyLoader()
    return ComplianceGatekeeper(loader)

def test_bank_health_gate_down(gatekeeper):
    """
    1. AI proposes immediate retry on HDFC during downtime -> Overridden by Bank Health Gate.
    Bank health < 30% (e.g. 10%) should force HALT.
    """
    payload = TransactionPayload(
        id="tx_down_123",
        amount=100.0,
        currency="INR",
        rail=PaymentRail.CARD,
        bank="HDFC",
        error_code="GATEWAY_ERROR",
        retry_count=0,
        jurisdiction=JurisdictionCode.IN_RBI
    )
    proposal = AIProposal(
        root_cause="Temporary connection failure",
        confidence=0.9,
        proposed_action=ActionType.IMMEDIATE_RETRY,
        delay_minutes=0,
        reasoning="Retry immediately as it is a transient error."
    )
    
    # Evaluate with bank health down (10%)
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=10.0)
    
    assert gated_action.action == ActionType.HALT
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "BANK_HEALTH_DOWN"
    assert "BANK_HEALTH_DOWN" in gated_action.compliance_stamp

def test_bank_health_gate_degraded(gatekeeper):
    """
    AI proposes immediate retry on HDFC during degraded state (e.g. 45%)
    -> Overridden to SCHEDULED_RETRY with cooling-off period.
    """
    payload = TransactionPayload(
        id="tx_degraded_123",
        amount=100.0,
        currency="INR",
        rail=PaymentRail.CARD,
        bank="HDFC",
        error_code="GATEWAY_ERROR",
        retry_count=0,
        jurisdiction=JurisdictionCode.IN_RBI
    )
    proposal = AIProposal(
        root_cause="Timeout",
        confidence=0.85,
        proposed_action=ActionType.IMMEDIATE_RETRY,
        delay_minutes=0,
        reasoning="Retry immediately."
    )
    
    # Evaluate with bank health degraded (45%)
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=45.0)
    
    assert gated_action.action == ActionType.SCHEDULED_RETRY
    assert gated_action.execution_delay_minutes == 480  # From IN_RBI.yaml cooling off (480 minutes)
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "BANK_HEALTH_DEGRADED"

def test_upi_bank_health_gate_rbi(gatekeeper):
    """
    UPI switch down policy in India: Halt retries until health > 70%.
    So if bank health is 65% (which is < 70%), it should halt if rail is UPI.
    """
    payload = TransactionPayload(
        id="tx_upi_123",
        amount=100.0,
        currency="INR",
        rail=PaymentRail.UPI,
        bank="ICICI",
        error_code="GATEWAY_ERROR",
        retry_count=0,
        jurisdiction=JurisdictionCode.IN_RBI
    )
    proposal = AIProposal(
        root_cause="Switch timeout",
        confidence=0.8,
        proposed_action=ActionType.IMMEDIATE_RETRY,
        delay_minutes=0,
        reasoning="Retry immediately."
    )
    
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=65.0)
    
    assert gated_action.action == ActionType.HALT
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "RBI_UPI_SWITCH_DOWN"

def test_cooling_period_gate_rbi_mandate(gatekeeper):
    """
    2. AI proposes 5m retry on recurring mandate -> Overridden to 8h (480m) cooling by RBI Gate.
    """
    payload = TransactionPayload(
        id="tx_mandate_123",
        amount=500.0,
        currency="INR",
        rail=PaymentRail.MANDATE,
        bank="SBI",
        error_code="BAD_REQUEST",
        retry_count=0,
        jurisdiction=JurisdictionCode.IN_RBI
    )
    proposal = AIProposal(
        root_cause="Insufficient customer approval time",
        confidence=0.95,
        proposed_action=ActionType.SCHEDULED_RETRY,
        delay_minutes=5,
        reasoning="AI wants a quick 5-minute retry."
    )
    
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=95.0)
    
    assert gated_action.action == ActionType.SCHEDULED_RETRY
    assert gated_action.execution_delay_minutes == 480  # Overridden to 8 hours
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "RULE_MANDATORY_COOLING_OFF"
    assert "RULE_MANDATORY_COOLING_OFF" in gated_action.compliance_stamp

def test_velocity_gate_rbi_max_retries(gatekeeper):
    """
    3. AI proposes 4th retry attempt -> Halted by RBI Velocity Cap (max 3 retries in 24h).
    """
    payload = TransactionPayload(
        id="tx_rbi_velocity_123",
        amount=100.0,
        currency="INR",
        rail=PaymentRail.CARD,
        bank="HDFC",
        error_code="GATEWAY_ERROR",
        retry_count=3,  # Already attempted 3 times
        jurisdiction=JurisdictionCode.IN_RBI
    )
    proposal = AIProposal(
        root_cause="Transient error",
        confidence=0.9,
        proposed_action=ActionType.IMMEDIATE_RETRY,
        delay_minutes=0,
        reasoning="AI proposes to retry one more time."
    )
    
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=99.0)
    
    assert gated_action.action == ActionType.HALT
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "RULE_MAX_VELOCITY_EXCEEDED"
    assert "HALTED" in gated_action.compliance_stamp

def test_velocity_gate_nacha_max_nsf(gatekeeper):
    """
    3. AI proposes 3rd retry attempt on NSF -> Halted by NACHA Velocity Cap (max 2 NSF retries).
    """
    payload = TransactionPayload(
        id="tx_nacha_nsf_123",
        amount=50.0,
        currency="USD",
        rail=PaymentRail.CARD,
        bank="CHASE",
        error_code="R01",  # NSF
        retry_count=2,  # Already retried twice
        jurisdiction=JurisdictionCode.US_NACHA
    )
    proposal = AIProposal(
        root_cause="NSF",
        confidence=0.8,
        proposed_action=ActionType.SCHEDULED_RETRY,
        delay_minutes=300,
        reasoning="Try again after customer deposits funds."
    )
    
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=99.0)
    
    assert gated_action.action == ActionType.HALT
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "RULE_MAX_NSF_RETRIES_EXCEEDED"

def test_disallowed_return_codes_nacha(gatekeeper):
    """
    NACHA: Disallowed return codes for retry: R05, R07, R10, R29.
    Attempting retry on R05 should be immediately HALTED.
    """
    payload = TransactionPayload(
        id="tx_nacha_revoked_123",
        amount=50.0,
        currency="USD",
        rail=PaymentRail.CARD,
        bank="CHASE",
        error_code="R05",  # Revoked/Unauthorized
        retry_count=0,
        jurisdiction=JurisdictionCode.US_NACHA
    )
    proposal = AIProposal(
        root_cause="Customer dispute",
        confidence=0.8,
        proposed_action=ActionType.IMMEDIATE_RETRY,
        delay_minutes=0,
        reasoning="Attempt authorization again."
    )
    
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=99.0)
    
    assert gated_action.action == ActionType.HALT
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "RULE_DISALLOWED_RETURN_CODE"

def test_card_retry_spacing_nacha(gatekeeper):
    """
    NACHA: Spacing between card retries must be >= 240 minutes.
    """
    payload = TransactionPayload(
        id="tx_nacha_card_spacing",
        amount=50.0,
        currency="USD",
        rail=PaymentRail.CARD,
        bank="CHASE",
        error_code="BAD_REQUEST",
        retry_count=0,
        jurisdiction=JurisdictionCode.US_NACHA
    )
    proposal = AIProposal(
        root_cause="Temporary bad response",
        confidence=0.8,
        proposed_action=ActionType.SCHEDULED_RETRY,
        delay_minutes=30,  # Below 240 minutes spacing
        reasoning="Retry after 30 minutes."
    )
    
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=99.0)
    
    assert gated_action.action == ActionType.SCHEDULED_RETRY
    assert gated_action.execution_delay_minutes == 240
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "RULE_MANDATORY_COOLING_OFF"

def test_eu_soft_decline_psd3(gatekeeper):
    """
    4. EU soft decline -> Successfully converted to SCA step-up challenge.
    Also, frictionless threshold (> 30 EUR) triggers SCA step-up.
    """
    # Test case A: Soft decline error code
    payload_a = TransactionPayload(
        id="tx_psd3_soft_decline",
        amount=20.0,
        currency="EUR",
        rail=PaymentRail.CARD,
        bank="SOCIETE_GENERALE",
        error_code="SOFT_DECLINE_SCA_REQUIRED",
        retry_count=0,
        jurisdiction=JurisdictionCode.EU_PSD3
    )
    proposal_a = AIProposal(
        root_cause="Authentication missing",
        confidence=0.9,
        proposed_action=ActionType.IMMEDIATE_RETRY,
        delay_minutes=0,
        reasoning="Retry without changes."
    )
    
    gated_a = gatekeeper.evaluate(proposal_a, payload_a, bank_health_pct=95.0)
    assert gated_a.action == ActionType.REQUEST_SCA_STEPUP
    assert gated_a.is_overridden is True
    assert gated_a.override_rule == "PSD3_SCA_MANDATORY"
    
    # Test case B: Above frictionless threshold (35 EUR)
    payload_b = TransactionPayload(
        id="tx_psd3_above_limit",
        amount=35.0,
        currency="EUR",
        rail=PaymentRail.CARD,
        bank="SOCIETE_GENERALE",
        error_code="BAD_REQUEST",
        retry_count=0,
        jurisdiction=JurisdictionCode.EU_PSD3
    )
    
    gated_b = gatekeeper.evaluate(proposal_a, payload_b, bank_health_pct=95.0)
    assert gated_b.action == ActionType.REQUEST_SCA_STEPUP
    assert gated_b.is_overridden is True
    assert gated_b.override_rule == "PSD3_SCA_THRESHOLD_EXCEEDED"

def test_rbi_afa_threshold_exceeded(gatekeeper):
    """
    RBI: Recurring mandate auto-debit > 15,000 INR -> Convert to SEND_INTENT_LINK.
    """
    payload = TransactionPayload(
        id="tx_rbi_mandate_large",
        amount=20000.0,
        currency="INR",
        rail=PaymentRail.MANDATE,
        bank="ICICI",
        error_code="BAD_REQUEST",
        retry_count=0,
        jurisdiction=JurisdictionCode.IN_RBI
    )
    proposal = AIProposal(
        root_cause="Mandate execution issue",
        confidence=0.9,
        proposed_action=ActionType.IMMEDIATE_RETRY,
        delay_minutes=0,
        reasoning="AI tries to auto-retry."
    )
    
    gated_action = gatekeeper.evaluate(proposal, payload, bank_health_pct=95.0)
    assert gated_action.action == ActionType.SEND_INTENT_LINK
    assert gated_action.is_overridden is True
    assert gated_action.override_rule == "RBI_AFA_THRESHOLD_EXCEEDED"

def test_audit_ledger_hash_chain(db_session):
    """
    5. Audit ledger block hashing creates a valid immutable chain.
    """
    # Create first block
    entry1 = AuditLedgerEntry(
        tx_id="tx_1",
        stage="PROPOSAL_EVALUATION",
        input_state="input_data_1",
        output_state="output_data_1",
        compliance_stamp="[IN_RBI:PASSED_CLEAN:CLEAN]",
        previous_hash="0" * 64,
        block_hash=""
    )
    
    # Compute its hash
    entry1.block_hash = generate_block_hash(
        prev_hash=entry1.previous_hash,
        tx_id=entry1.tx_id,
        state=entry1.output_state,
        timestamp=str(entry1.timestamp)
    )
    
    db_session.add(entry1)
    db_session.commit()
    db_session.refresh(entry1)
    
    # Create second block linking to first
    entry2 = AuditLedgerEntry(
        tx_id="tx_2",
        stage="PROPOSAL_EVALUATION",
        input_state="input_data_2",
        output_state="output_data_2",
        compliance_stamp="[IN_RBI:OVERRIDDEN:RULE_MANDATORY_COOLING_OFF]",
        previous_hash=entry1.block_hash,
        block_hash=""
    )
    
    entry2.block_hash = generate_block_hash(
        prev_hash=entry2.previous_hash,
        tx_id=entry2.tx_id,
        state=entry2.output_state,
        timestamp=str(entry2.timestamp)
    )
    
    db_session.add(entry2)
    db_session.commit()
    db_session.refresh(entry2)
    
    # Fetch from db and verify chain
    entries = db_session.query(AuditLedgerEntry).order_by(AuditLedgerEntry.id).all()
    assert len(entries) == 2
    
    # Verify linking
    assert entries[1].previous_hash == entries[0].block_hash
    
    # Verify cryptographic integrity
    for entry in entries:
        recalculated_hash = generate_block_hash(
            prev_hash=entry.previous_hash,
            tx_id=entry.tx_id,
            state=entry.output_state,
            timestamp=str(entry.timestamp)
        )
        assert entry.block_hash == recalculated_hash

def test_verify_webhook_signature():
    """
    Test utility function for HMAC SHA-256 signature verification.
    """
    payload = "webhook_received_event_data"
    secret = "super_secret_webhook_key"
    # Signature generated using standard HMAC SHA-256 for the payload
    # Let's generate it using hmac directly in the test to verify compare_digest matches
    import hmac
    import hashlib
    expected_sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    
    assert verify_razorpay_signature(payload, expected_sig, secret) is True
    assert verify_razorpay_signature(payload, "invalid_sig", secret) is False

def test_benchmark_endpoint():
    """
    Test benchmark run endpoint of the FastAPI application.
    Exercises the entire pipeline with all 50 cases.
    """
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.app.core.database import create_db_and_tables
    
    # Ensure database and tables are created
    create_db_and_tables()
    
    with TestClient(app) as client:
        response = client.post("/api/v1/benchmark/run")
        assert response.status_code == 200
        
        data = response.json()
        assert "summary" in data
        assert "results" in data
        
        summary = data["summary"]
        assert summary["total_processed"] == 50
        assert summary["zero_compliance_violations"] is True
        assert summary["compliance_violations"] == 0
        assert summary["recovered_pct"] > 0
        
        # Verify we returned exactly 50 case results
        assert len(data["results"]) == 50

def test_webhook_signature_secret_selection_and_endpoint():
    """
    Test that webhook signature checks settings.RAZORPAY_WEBHOOK_SECRET when set,
    falls back to settings.SECRET_KEY when blank, and that /api/v1/webhooks/razorpay
    fails closed (401) when X-Razorpay-Signature is missing.
    """
    import hmac
    import hashlib
    import json
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.app.core.config import settings

    payload = json.dumps({
        "id": "pay_test_sig_123",
        "amount": 1500,
        "currency": "INR",
        "rail": "UPI",
        "bank": "HDFC",
        "error_code": "U30"
    })

    # 1. When RAZORPAY_WEBHOOK_SECRET is set, it takes precedence over SECRET_KEY
    settings.RAZORPAY_WEBHOOK_SECRET = "specific_webhook_secret_key"
    settings.SECRET_KEY = "fallback_secret_key"
    
    correct_sig = hmac.new(b"specific_webhook_secret_key", payload.encode(), hashlib.sha256).hexdigest()
    fallback_sig = hmac.new(b"fallback_secret_key", payload.encode(), hashlib.sha256).hexdigest()
    
    assert verify_razorpay_signature(payload, correct_sig) is True
    assert verify_razorpay_signature(payload, fallback_sig) is False

    # 2. When RAZORPAY_WEBHOOK_SECRET is blank, it falls back to SECRET_KEY
    settings.RAZORPAY_WEBHOOK_SECRET = ""
    assert verify_razorpay_signature(payload, fallback_sig) is True

    # 3. Test HTTP endpoint fails closed when signature is missing
    with TestClient(app) as client:
        # Missing signature -> 401
        res_missing = client.post(
            "/api/v1/webhooks/razorpay",
            content=payload,
            headers={"Content-Type": "application/json"}
        )
        assert res_missing.status_code == 401
        assert "Missing X-Razorpay-Signature header" in res_missing.json()["detail"]

        # Invalid signature -> 401
        res_invalid = client.post(
            "/api/v1/webhooks/razorpay",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": "totally_invalid_signature"
            }
        )
        assert res_invalid.status_code == 401
        assert "Invalid signature" in res_invalid.json()["detail"]

        # Valid signature with fallback key -> 200
        res_valid = client.post(
            "/api/v1/webhooks/razorpay",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": fallback_sig
            }
        )
        assert res_valid.status_code == 200
        assert "action" in res_valid.json()

