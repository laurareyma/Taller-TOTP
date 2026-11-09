"""PKCE (RFC 7636) del lado del servidor: solo se acepta el método S256."""

import base64
import hashlib
import hmac
import re

# code_verifier: 43 a 128 caracteres "unreserved" (RFC 7636 §4.1)
VERIFIER_PATTERN = re.compile(r"[A-Za-z0-9\-._~]{43,128}")
# code_challenge S256: SHA-256 (32 bytes) en Base64URL sin relleno = 43 caracteres
CHALLENGE_PATTERN = re.compile(r"[A-Za-z0-9\-_]{43}")


def s256_challenge(code_verifier: str) -> str:
    """BASE64URL( SHA256( ASCII(code_verifier) ) ) sin '='."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def is_valid_challenge(code_challenge: str) -> bool:
    return CHALLENGE_PATTERN.fullmatch(code_challenge) is not None


def verify(code_verifier: str, code_challenge: str) -> bool:
    """Comprueba SHA256(code_verifier) == code_challenge en tiempo constante."""
    if VERIFIER_PATTERN.fullmatch(code_verifier) is None:
        return False
    return hmac.compare_digest(s256_challenge(code_verifier), code_challenge)
