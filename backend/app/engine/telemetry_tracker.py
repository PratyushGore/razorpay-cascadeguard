import threading
from typing import Dict, TypedDict

class BankHealthState(TypedDict):
    switch_health_pct: float
    latency_ms: float
    status: str  # 'HEALTHY' | 'DEGRADED' | 'DOWN'

class BankTelemetryTracker:
    def __init__(self):
        self._lock = threading.Lock()
        self._registry: Dict[str, BankHealthState] = {}
        self.reset_all()

    def reset_all(self):
        with self._lock:
            # Initialize default healthy states for major banks
            for bank in ["HDFC", "SBI", "ICICI", "AXIS", "CHASE", "BARCLAYS"]:
                self._registry[bank] = {
                    "switch_health_pct": 100.0,
                    "latency_ms": 50.0,
                    "status": "HEALTHY"
                }

    def set_bank_health(self, bank: str, health_pct: float, latency_ms: float = 50.0):
        with self._lock:
            # Clean/capitalize bank name
            bank_key = bank.upper()
            if health_pct < 30.0:
                status = "DOWN"
            elif health_pct < 60.0:
                status = "DEGRADED"
            else:
                status = "HEALTHY"
            
            self._registry[bank_key] = {
                "switch_health_pct": float(health_pct),
                "latency_ms": float(latency_ms),
                "status": status
            }

    def get_bank_health(self, bank: str) -> BankHealthState:
        with self._lock:
            bank_key = bank.upper()
            # Default fallback if a bank is not found
            if bank_key not in self._registry:
                return {
                    "switch_health_pct": 100.0,
                    "latency_ms": 50.0,
                    "status": "HEALTHY"
                }
            return self._registry[bank_key].copy()

    def get_all_health(self) -> Dict[str, BankHealthState]:
        with self._lock:
            return {k: v.copy() for k, v in self._registry.items()}

# Singleton bank telemetry tracker
telemetry_tracker = BankTelemetryTracker()
