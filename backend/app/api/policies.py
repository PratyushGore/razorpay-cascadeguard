from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List

from backend.app.guardrails.policy_loader import policy_loader

router = APIRouter()

# Simple global configuration state for active default jurisdiction
class ActiveJurisdictionState:
    def __init__(self):
        self.active_code = "IN_RBI"

active_jurisdiction = ActiveJurisdictionState()

class SwitchJurisdictionRequest(BaseModel):
    jurisdiction_code: str

@router.get("")
async def list_policies():
    """
    List all available jurisdictions configured in the rulebooks.
    """
    codes = policy_loader.list_active_jurisdictions()
    policies = []
    for code in codes:
        p = policy_loader.get_policy(code)
        policies.append({
            "code": code,
            "name": p.get("name", code),
            "is_active": code == active_jurisdiction.active_code
        })
    return policies

@router.get("/{jurisdiction_code}")
async def get_policy_rules(jurisdiction_code: str):
    """
    Retrieve rules for a specific jurisdiction.
    """
    policy = policy_loader.get_policy(jurisdiction_code.upper())
    if not policy:
        raise HTTPException(status_code=404, detail=f"Jurisdiction {jurisdiction_code} not found")
    return policy

@router.post("/switch")
async def switch_active_policy(req: SwitchJurisdictionRequest):
    """
    Switches the active default jurisdiction.
    """
    code = req.jurisdiction_code.upper()
    valid_codes = policy_loader.list_active_jurisdictions()
    if code not in valid_codes:
        raise HTTPException(status_code=400, detail=f"Invalid jurisdiction code. Valid options are: {valid_codes}")
    active_jurisdiction.active_code = code
    return {
        "status": "success",
        "active_jurisdiction": code
    }
