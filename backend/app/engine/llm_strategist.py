import os
import json
from google import genai
from google.genai import types
from google.genai.errors import APIError

from backend.app.models.schemas import AIProposal, ActionType, TransactionPayload, PaymentRail
from backend.app.engine.diagnoser import FailureDiagnosis

def _get_deterministic_fallback(transaction: TransactionPayload, diagnosis: FailureDiagnosis) -> AIProposal:
    """
    Intelligent fallback rule engine used in offline mode, or when GEMINI_API_KEY is not configured/invalid.
    """
    err = transaction.error_code.upper()
    rail = transaction.rail
    
    # 1. Check disallowed/revoked codes first
    if err in ("R05", "R07", "R10", "R29"):
        return AIProposal(
            root_cause=diagnosis.root_cause,
            confidence=1.0,
            proposed_action=ActionType.HALT,
            delay_minutes=0,
            reasoning="Transaction permissions revoked or unauthorized by customer. Retries are strictly forbidden."
        )

    # 2. Check technical declines / switch status
    if diagnosis.failure_type == "TECHNICAL_DECLINE":
        switch_status = diagnosis.details.get("switch_status", "HEALTHY")
        switch_health = diagnosis.details.get("switch_health_pct", 100.0)
        
        if switch_status == "DOWN":
            return AIProposal(
                root_cause=diagnosis.root_cause,
                confidence=0.95,
                proposed_action=ActionType.HALT,
                delay_minutes=0,
                reasoning=f"Issuer switch health is critical ({switch_health}%). Halting retries until switch is healthy."
            )
        elif switch_status == "DEGRADED" or switch_health < 70.0:
            # Recommending schedule retry with cooling-off period (e.g. 8 hours)
            return AIProposal(
                root_cause=diagnosis.root_cause,
                confidence=0.9,
                proposed_action=ActionType.SCHEDULED_RETRY,
                delay_minutes=480,
                reasoning=f"Switch is degraded ({switch_health}%). Delaying retry to allow switch to recover."
            )
        else:
            # Switch is healthy but hit a transient timeout / connection failure
            return AIProposal(
                root_cause=diagnosis.root_cause,
                confidence=0.85,
                proposed_action=ActionType.IMMEDIATE_RETRY,
                delay_minutes=0,
                reasoning="Transient connection failure on healthy switch. Immediate retry recommended."
            )

    # 3. Check business declines
    if err == "SOFT_DECLINE_SCA_REQUIRED":
        return AIProposal(
            root_cause=diagnosis.root_cause,
            confidence=1.0,
            proposed_action=ActionType.REQUEST_SCA_STEPUP,
            delay_minutes=0,
            reasoning="Card issuer requires Strong Customer Authentication (SCA). Prompting user for step-up authentication."
        )
        
    if err in ("NSF", "R01", "R09", "INSUFFICIENT_FUNDS"):
        # For NSF, retry after a scheduling delay (give customer time to top up account)
        return AIProposal(
            root_cause=diagnosis.root_cause,
            confidence=0.85,
            proposed_action=ActionType.SCHEDULED_RETRY,
            delay_minutes=360,  # 6 hours
            reasoning="Insufficient funds error. Proposing retry in 6 hours to allow user time to fund their account."
        )

    # 4. Under RBI, if amount > 15,000 for recurring mandate, send intent link for approval
    if transaction.jurisdiction.value == "IN_RBI" and rail == PaymentRail.MANDATE and transaction.amount > 15000.0:
        return AIProposal(
            root_cause=diagnosis.root_cause,
            confidence=0.95,
            proposed_action=ActionType.SEND_INTENT_LINK,
            delay_minutes=0,
            reasoning="Recurring e-mandate transaction exceeds INR 15,000 threshold. Sending payment intent link for direct authentication."
        )

    # 5. General low-value card or general failures
    if transaction.amount > 30.0 and transaction.currency == "EUR" and transaction.jurisdiction.value == "EU_PSD3":
        # Over threshold for PSD3 SCA
        return AIProposal(
            root_cause=diagnosis.root_cause,
            confidence=0.9,
            proposed_action=ActionType.REQUEST_SCA_STEPUP,
            delay_minutes=0,
            reasoning="Transaction exceeds PSD3 frictionless threshold of 30 EUR. Requesting step-up SCA."
        )

    # Default clean pass / immediate retry proposal
    return AIProposal(
        root_cause=diagnosis.root_cause,
        confidence=0.8,
        proposed_action=ActionType.IMMEDIATE_RETRY,
        delay_minutes=0,
        reasoning="Failure appears to be a temporary business/system issue. Proposing immediate retry."
    )

def generate_recovery_strategy(transaction: TransactionPayload, diagnosis: FailureDiagnosis) -> AIProposal:
    """
    Queries Gemini 2.5 Flash using the structured output API to generate an AIProposal.
    If the API key is not configured, or call fails, falls back to the deterministic rule engine.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "change_me" or api_key == "":
        return _get_deterministic_fallback(transaction, diagnosis)

    try:
        # Initialize Google GenAI client with key from environment
        client = genai.Client()
        
        prompt = f"""
        You are the CascadeGuard Autonomous Revenue Recovery engine.
        A transaction payment failed, and you must propose the optimal recovery action.
        
        Transaction Details:
        - ID: {transaction.id}
        - Amount: {transaction.amount} {transaction.currency}
        - Payment Rail: {transaction.rail.value}
        - Bank: {transaction.bank}
        - Error Code: {transaction.error_code}
        - Jurisdiction: {transaction.jurisdiction.value}
        - Retry Count: {transaction.retry_count}
        
        Failure Diagnosis:
        - Type: {diagnosis.failure_type}
        - Root Cause: {diagnosis.root_cause}
        - Switch Health: {diagnosis.details.get('switch_health_pct')}%
        - Switch Status: {diagnosis.details.get('switch_status')}
        
        Determine the best ActionType to recover this revenue:
        - IMMEDIATE_RETRY (Retry immediately)
        - SCHEDULED_RETRY (Retry after a cooling/spacing delay)
        - SEND_INTENT_LINK (Generate a payment link for direct authentication)
        - REQUEST_SCA_STEPUP (Trigger customer Strong Customer Authentication / AFA Step-up)
        - HALT (Halt all recovery attempts)
        
        Provide the proposed action, delay in minutes (if scheduled), confidence score (0.0 to 1.0), diagnosed root cause, and detailed reasoning.
        """
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AIProposal,
                temperature=0.1
            )
        )
        
        # Check and parse JSON response
        data = json.loads(response.text)
        return AIProposal(**data)
        
    except Exception as e:
        # Log error locally and return fallback
        print(f"[Gemini Strategy Generator] API error: {e}. Running fallback rule engine.")
        return _get_deterministic_fallback(transaction, diagnosis)
