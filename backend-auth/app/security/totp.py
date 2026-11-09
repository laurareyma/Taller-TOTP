"""TOTP (RFC 6238) implementado desde cero con la biblioteca estándar (sin pyotp)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import struct

PERIOD = 30
DIGITS = 6


def decode_secret(secret: str) -> bytes:
    """Semilla Base32 → bytes (tolera espacios, guiones, minúsculas y falta de relleno)."""
    clean = secret.replace(" ", "").replace("-", "").upper().rstrip("=")
    return base64.b32decode(clean + "=" * (-len(clean) % 8))


def hotp(key: bytes, counter: int, digits: int = DIGITS) -> str:
    """HOTP (RFC 4226): HMAC-SHA1 del contador de 8 bytes Big-Endian + truncamiento dinámico."""
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    bin_code = (
        ((mac[offset] & 0x7F) << 24)
        | ((mac[offset + 1] & 0xFF) << 16)
        | ((mac[offset + 2] & 0xFF) << 8)
        | (mac[offset + 3] & 0xFF)
    )
    return str(bin_code % 10**digits).zfill(digits)


def time_step(now: float, period: int = PERIOD) -> int:
    """T = floor(UnixTimestamp / 30)"""
    return int(now // period)


def match_counter(secret: str, code: str, now: float, *, window: int = 1, period: int = PERIOD) -> int | None:
    """Busca el código en las ventanas C-1, C y C+1 (tolerancia a desfase de reloj).

    Devuelve la ventana (contador) que coincidió, o None. Se revisan todas las ventanas
    y se compara en tiempo constante para no filtrar información por tiempos de respuesta.
    """
    key = decode_secret(secret)
    current = time_step(now, period)
    matched: int | None = None
    for counter in range(current - window, current + window + 1):
        if hmac.compare_digest(hotp(key, counter), code) and matched is None:
            matched = counter
    return matched
