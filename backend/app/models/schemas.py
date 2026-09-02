from enum import Enum
from typing import Optional, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field

class PaymentRail(str, Enum):
    UPI = "UPI"
    CARD = "CARD"
    MANDATE = "MANDATE"
    NETBANKING = "NETBANKING"

class ErrorCode(str, Enum):
    BAD_REQUEST = "BAD_REQUEST"
    GATEWAY_ERROR = "GATEWAY_ERROR"
    NSF = "NSF"
    
    # NACHA specific
    R01 = "R01"  # Insufficient Funds
    R09 = "R09"  # Uncollected Funds
    R05 = "R05"  # Unauthorized consumer debit
    R07 = "R07"  # Authorization revoked
    R10 = "R10"  # Customer Advises Not Authorized
    R29 = "R29"  # Corporate Customer Advises Not Authorized
    
    # PSD3 specific
    SOFT_DECLINE_SCA_REQUIRED = "SOFT_DECLINE_SCA_REQUIRED"
    
    # General / Unknown
    UNKNOWN = "UNKNOWN"

class JurisdictionCode(str, Enum):
    IN_RBI = "IN_RBI"
    US_NACHA = "US_NACHA"
    EU_PSD3 = "EU_PSD3"

class ActionType(str, Enum):
    IMMEDIATE_RETRY = "IMMEDIATE_RETRY"
    SCHEDULED_RETRY = "SCHEDULED_RETRY"
    SEND_INTENT_LINK = "SEND_INTENT_LINK"
    REQUEST_SCA_STEPUP = "REQUEST_SCA_STEPUP"
    HALT = "HALT"

class GatekeeperStatus(str, Enum):
    PASSED_CLEAN = "PASSED_CLEAN"
    OVERRIDDEN = "OVERRIDDEN"
    HALTED = "HALTED"

class AIProposal(BaseModel):
    root_cause: str
    confidence: float
    proposed_action: ActionType
    delay_minutes: int
    reasoning: str

class GatedAction(BaseModel):
    action: ActionType
    execution_delay_minutes: int
    is_overridden: bool
    override_rule: Optional[str] = None
    compliance_stamp: str
    sanitized_reason: Optional[str] = None

class TransactionPayload(BaseModel):
    id: str
    amount: float
    currency: str
    rail: PaymentRail
    bank: str
    error_code: str
    retry_count: int
    jurisdiction: JurisdictionCode
    last_attempt_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None

class BenchmarkCase(BaseModel):
    id: str
    description: str
    payload: TransactionPayload
    ai_proposal: AIProposal
    bank_health_pct: float
    expected_action: ActionType
    expected_status: GatekeeperStatus
