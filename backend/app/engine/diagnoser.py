from pydantic import BaseModel
from typing import Dict, Any
from backend.app.engine.telemetry_tracker import telemetry_tracker

class FailureDiagnosis(BaseModel):
    failure_type: str  # "TECHNICAL_DECLINE" | "BUSINESS_DECLINE"
    root_cause: str
    recommended_retry_allowed: bool
    details: Dict[str, Any]

def diagnose_failure(error_code: str, payment_rail: str, bank_name: str) -> FailureDiagnosis:
    """
    Classifies a payment failure into Technical Declines (TD) or Business Declines (BD).
    Uses the current bank telemetry state and the error code mapping.
    """
    bank_health = telemetry_tracker.get_bank_health(bank_name)
    health_status = bank_health.get("status", "HEALTHY")
    health_pct = bank_health.get("switch_health_pct", 100.0)

    # Convert to uppercase for comparison
    err = error_code.upper()
    rail = payment_rail.upper()

    # List of error codes that are inherently technical (network, gateway, timeout)
    technical_error_codes = {
        "GATEWAY_ERROR", "TIMEOUT", "NETWORK_ERROR", "CONNECTION_FAILED",
        "SERVER_ERROR", "SYSTEM_DOWN", "SWITCH_OFFLINE", "MAINTENANCE"
    }

    # List of error codes that are business issues
    business_error_codes = {
        "NSF", "INSUFFICIENT_FUNDS", "R01", "R09", "CARD_EXPIRED", "LIMIT_EXCEEDED",
        "AUTHENTICATION_FAILED", "BAD_REQUEST", "INVALID_CARD", "R05", "R07", "R10", "R29",
        "SOFT_DECLINE_SCA_REQUIRED"
    }

    # Classification logic
    is_technical = False
    root_cause = "Unknown failure reason"
    
    # 1. Check switch health first
    if health_status == "DOWN":
        is_technical = True
        root_cause = f"Bank switch for {bank_name} is DOWN ({health_pct}% health)."
    elif health_status == "DEGRADED":
        is_technical = True
        root_cause = f"Bank switch for {bank_name} is DEGRADED ({health_pct}% health)."
    # 2. Check if the error code is known to be technical
    elif err in technical_error_codes:
        is_technical = True
        root_cause = f"Technical Gateway failure reported: {error_code}."
    # 3. Check if business decline
    elif err in business_error_codes:
        is_technical = False
        if err in ("NSF", "R01", "R09", "INSUFFICIENT_FUNDS"):
            root_cause = "Insufficient customer balance (NSF)."
        elif err == "SOFT_DECLINE_SCA_REQUIRED":
            root_cause = "SCA Step-Up authentication required."
        elif err in ("R05", "R07", "R10", "R29"):
            root_cause = f"Revoked/Unauthorized transaction permission ({error_code})."
        else:
            root_cause = f"Business decline: {error_code}."
    # 4. Fallback default
    else:
        # If switch health is degraded but not marked DOWN/DEGRADED, let's treat based on health pct
        if health_pct < 60.0:
            is_technical = True
            root_cause = f"Potential bank switch degradation: {bank_name} at {health_pct}% health."
        else:
            is_technical = False
            root_cause = f"Customer or business decline: {error_code}."

    # Decide if retry is allowed
    # Technically, we should retry technical failures (with cooling off) and some business failures (like NSF)
    # But disallowed NACHA return codes cannot be retried at all
    recommended_retry = True
    if err in ("R05", "R07", "R10", "R29"):
        recommended_retry = False

    return FailureDiagnosis(
        failure_type="TECHNICAL_DECLINE" if is_technical else "BUSINESS_DECLINE",
        root_cause=root_cause,
        recommended_retry_allowed=recommended_retry,
        details={
            "bank_name": bank_name,
            "switch_health_pct": health_pct,
            "switch_status": health_status,
            "original_error_code": error_code,
            "payment_rail": payment_rail
        }
    )
