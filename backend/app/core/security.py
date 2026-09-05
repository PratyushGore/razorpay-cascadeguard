import hmac
import hashlib
from typing import Optional
from backend.app.core.config import settings

def get_webhook_secret() -> str:
    return settings.RAZORPAY_WEBHOOK_SECRET if settings.RAZORPAY_WEBHOOK_SECRET else settings.SECRET_KEY

def verify_razorpay_signature(payload: str, signature: str, secret: Optional[str] = None) -> bool:
    """
    Verifies a Razorpay webhook signature using HMAC-SHA256.
    Checks against settings.RAZORPAY_WEBHOOK_SECRET when non-empty,
    falling back to settings.SECRET_KEY only if it's blank.
    """
    signing_secret = secret if (secret is not None and secret != "") else get_webhook_secret()
    if not signing_secret or not signature:
        return False
    expected = hmac.new(
        signing_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

def generate_block_hash(prev_hash: str, tx_id: str, state: str, timestamp: str) -> str:
    """
    Generates a SHA-256 hash for an audit ledger block to secure the hash chain:
    SHA256(prev_hash + tx_id + state + timestamp)
    """
    message = f"{prev_hash}{tx_id}{state}{timestamp}"
    return hashlib.sha256(message.encode("utf-8")).hexdigest()
