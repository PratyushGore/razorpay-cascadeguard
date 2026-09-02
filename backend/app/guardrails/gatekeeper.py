from backend.app.models.schemas import (
    AIProposal, TransactionPayload, GatedAction, 
    ActionType, GatekeeperStatus, PaymentRail
)
from backend.app.guardrails.policy_loader import PolicyLoader

class ComplianceGatekeeper:
    def __init__(self, policy_loader: PolicyLoader):
        self.policy_loader = policy_loader

    def evaluate(self, proposal: AIProposal, transaction: TransactionPayload, bank_health_pct: float) -> GatedAction:
        policy = self.policy_loader.get_policy(transaction.jurisdiction.value)
        rules = policy.get("rules", {})

        # Start with proposed actions from AI
        action = proposal.proposed_action
        delay_minutes = proposal.delay_minutes
        is_overridden = False
        override_rule = None
        sanitized_reason = None
        status = GatekeeperStatus.PASSED_CLEAN

        # ----------------------------------------------------
        # 1. Bank Health Gate
        # If issuer switch is DEGRADED (<60%) or DOWN (<30%), prevent immediate retries.
        # UPI switch down policy: Halt retries until health > 70% in RBI.
        # ----------------------------------------------------
        if transaction.jurisdiction.value == "IN_RBI" and transaction.rail == PaymentRail.UPI:
            upi_min_health = rules.get("upi_min_bank_health_pct", 70.0)
            if bank_health_pct < upi_min_health:
                action = ActionType.HALT
                delay_minutes = 0
                is_overridden = True
                override_rule = "RBI_UPI_SWITCH_DOWN"
                sanitized_reason = f"UPI switch health ({bank_health_pct}%) below required threshold ({upi_min_health}%)."
                status = GatekeeperStatus.HALTED

        # Generic Bank Health check
        if status != GatekeeperStatus.HALTED and action in (ActionType.IMMEDIATE_RETRY, ActionType.SCHEDULED_RETRY):
            if bank_health_pct < 30.0:
                action = ActionType.HALT
                delay_minutes = 0
                is_overridden = True
                override_rule = "BANK_HEALTH_DOWN"
                sanitized_reason = f"Issuer switch is down ({bank_health_pct}% < 30%). Immediate retries blocked."
                status = GatekeeperStatus.HALTED
            elif bank_health_pct < 60.0 and action == ActionType.IMMEDIATE_RETRY:
                action = ActionType.SCHEDULED_RETRY
                # Use general cooling off or default 240 minutes for degraded banks
                cooling_period = rules.get("cooling_off_period_minutes", 240)
                delay_minutes = max(delay_minutes, cooling_period)
                is_overridden = True
                override_rule = "BANK_HEALTH_DEGRADED"
                sanitized_reason = f"Issuer switch is degraded ({bank_health_pct}% < 60%). Immediate retry converted to scheduled retry with {delay_minutes}m cooling-off."
                status = GatekeeperStatus.OVERRIDDEN

        # ----------------------------------------------------
        # 2. Velocity Gate
        # If retry count exceeds policy cap, force HALT
        # ----------------------------------------------------
        if status != GatekeeperStatus.HALTED and action in (ActionType.IMMEDIATE_RETRY, ActionType.SCHEDULED_RETRY):
            # Check for NACHA NSF specific caps
            is_nsf = False
            if transaction.jurisdiction.value == "US_NACHA":
                nsf_codes = rules.get("nsf_error_codes", ["NSF", "R01", "R09"])
                if transaction.error_code in nsf_codes:
                    is_nsf = True
                    max_nsf = rules.get("max_nsf_retries", 2)
                    if transaction.retry_count >= max_nsf:
                        action = ActionType.HALT
                        delay_minutes = 0
                        is_overridden = True
                        override_rule = "RULE_MAX_NSF_RETRIES_EXCEEDED"
                        sanitized_reason = f"NSF retry limit of {max_nsf} exceeded. Current retry count: {transaction.retry_count}."
                        status = GatekeeperStatus.HALTED

            # General velocity cap check
            if not is_nsf and status != GatekeeperStatus.HALTED:
                max_retries = rules.get("max_retries_24h")
                if max_retries is not None and transaction.retry_count >= max_retries:
                    action = ActionType.HALT
                    delay_minutes = 0
                    is_overridden = True
                    override_rule = "RULE_MAX_VELOCITY_EXCEEDED"
                    sanitized_reason = f"Velocity retry limit of {max_retries} exceeded. Current retry count: {transaction.retry_count}."
                    status = GatekeeperStatus.HALTED

        # ----------------------------------------------------
        # 3. Disallowed Return Codes Gate
        # ----------------------------------------------------
        if status != GatekeeperStatus.HALTED and action in (ActionType.IMMEDIATE_RETRY, ActionType.SCHEDULED_RETRY):
            disallowed_codes = rules.get("disallowed_retry_error_codes", [])
            if transaction.error_code in disallowed_codes:
                action = ActionType.HALT
                delay_minutes = 0
                is_overridden = True
                override_rule = "RULE_DISALLOWED_RETURN_CODE"
                sanitized_reason = f"Retry disallowed for return code: {transaction.error_code}."
                status = GatekeeperStatus.HALTED

        # ----------------------------------------------------
        # 4. Cooling Period Gate
        # ----------------------------------------------------
        if status != GatekeeperStatus.HALTED and action in (ActionType.IMMEDIATE_RETRY, ActionType.SCHEDULED_RETRY):
            # Check generic cooling-off period
            cooling_period = rules.get("cooling_off_period_minutes")
            if cooling_period is not None:
                # RBI cooling off period only applies to recurring mandates
                if transaction.jurisdiction.value != "IN_RBI" or transaction.rail == PaymentRail.MANDATE:
                    current_delay = 0 if action == ActionType.IMMEDIATE_RETRY else delay_minutes
                    if current_delay < cooling_period:
                        action = ActionType.SCHEDULED_RETRY
                        delay_minutes = cooling_period
                        is_overridden = True
                        override_rule = "RULE_MANDATORY_COOLING_OFF"
                        sanitized_reason = f"Proposed delay of {current_delay}m is below mandated cooling-off period of {cooling_period}m."
                        status = GatekeeperStatus.OVERRIDDEN

            # Spacing between card retries under NACHA
            if transaction.jurisdiction.value == "US_NACHA" and transaction.rail == PaymentRail.CARD:
                card_spacing = rules.get("min_card_retry_spacing_minutes", 240)
                current_delay = 0 if action == ActionType.IMMEDIATE_RETRY else delay_minutes
                if current_delay < card_spacing:
                    action = ActionType.SCHEDULED_RETRY
                    delay_minutes = card_spacing
                    is_overridden = True
                    override_rule = "RULE_MANDATORY_COOLING_OFF"
                    sanitized_reason = f"Proposed card delay of {current_delay}m is below mandated card retry spacing of {card_spacing}m."
                    status = GatekeeperStatus.OVERRIDDEN

        # ----------------------------------------------------
        # 5. SCA / AFA Gate
        # ----------------------------------------------------
        if status != GatekeeperStatus.HALTED and action in (ActionType.IMMEDIATE_RETRY, ActionType.SCHEDULED_RETRY):
            if transaction.jurisdiction.value == "EU_PSD3":
                soft_decline_code = rules.get("soft_decline_error_code", "SOFT_DECLINE_SCA_REQUIRED")
                frictionless_threshold = rules.get("frictionless_threshold_amount", 30.0)
                frictionless_currency = rules.get("frictionless_threshold_currency", "EUR")

                if transaction.error_code == soft_decline_code:
                    action = ActionType.REQUEST_SCA_STEPUP
                    delay_minutes = 0
                    is_overridden = True
                    override_rule = "PSD3_SCA_MANDATORY"
                    sanitized_reason = f"Soft decline {soft_decline_code} received. SCA re-authentication required."
                    status = GatekeeperStatus.OVERRIDDEN
                elif transaction.amount > frictionless_threshold and transaction.currency == frictionless_currency:
                    action = ActionType.REQUEST_SCA_STEPUP
                    delay_minutes = 0
                    is_overridden = True
                    override_rule = "PSD3_SCA_THRESHOLD_EXCEEDED"
                    sanitized_reason = f"Transaction amount {transaction.amount} {transaction.currency} exceeds frictionless threshold of {frictionless_threshold}."
                    status = GatekeeperStatus.OVERRIDDEN

            elif transaction.jurisdiction.value == "IN_RBI":
                if transaction.rail == PaymentRail.MANDATE:
                    threshold = rules.get("pre_debit_notification_threshold_amount", 15000.0)
                    threshold_currency = rules.get("pre_debit_notification_threshold_currency", "INR")
                    if transaction.amount > threshold and transaction.currency == threshold_currency:
                        action = ActionType.SEND_INTENT_LINK
                        delay_minutes = 0
                        is_overridden = True
                        override_rule = "RBI_AFA_THRESHOLD_EXCEEDED"
                        sanitized_reason = f"Recurring mandate amount {transaction.amount} exceeds pre-debit threshold of {threshold}. Send intent link required."
                        status = GatekeeperStatus.OVERRIDDEN

        # ----------------------------------------------------
        # 6. Generate Compliance Stamp
        # ----------------------------------------------------
        stamp_rule = override_rule if is_overridden else "CLEAN"
        compliance_stamp = f"[{transaction.jurisdiction.value}:{status.value}:{stamp_rule}]"

        return GatedAction(
            action=action,
            execution_delay_minutes=delay_minutes,
            is_overridden=is_overridden,
            override_rule=override_rule,
            compliance_stamp=compliance_stamp,
            sanitized_reason=sanitized_reason
        )
