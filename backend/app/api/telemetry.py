from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional

from backend.app.engine.telemetry_tracker import telemetry_tracker

router = APIRouter()

class SimulateOutageRequest(BaseModel):
    bank: str
    health_pct: float
    latency_ms: Optional[float] = 50.0

class ResetTelemetryRequest(BaseModel):
    pass

@router.get("")
async def get_telemetry():
    """
    Returns current health status for all registered banks.
    """
    return telemetry_tracker.get_all_health()

@router.post("/simulate-outage")
async def simulate_outage(req: SimulateOutageRequest):
    """
    Simulates a switch outage or degradation for a target bank.
    """
    bank_name = req.bank.upper()
    valid_banks = {"HDFC", "SBI", "ICICI", "AXIS", "CHASE", "BARCLAYS"}
    if bank_name not in valid_banks:
        raise HTTPException(status_code=400, detail=f"Bank {req.bank} not tracked. Valid: {list(valid_banks)}")

    telemetry_tracker.set_bank_health(bank_name, req.health_pct, req.latency_ms)
    return {
        "status": "success",
        "bank": bank_name,
        "new_state": telemetry_tracker.get_bank_health(bank_name)
    }

@router.post("/reset")
async def reset_telemetry():
    """
    Resets all bank switch health scores back to 100%.
    """
    telemetry_tracker.reset_all()
    return {
        "status": "success",
        "message": "All bank switch health metrics reset to healthy (100% / 50ms)."
    }
