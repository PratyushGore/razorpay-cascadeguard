import hmac
import hashlib

def verify_razorpay_signature(payload: str, signature: str, secret: str) -> bool:
    """
    Verifies a Razorpay webhook signature using HMAC-SHA256.
    """
    expected = hmac.new(
        secret.encode("utf-8"),
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
