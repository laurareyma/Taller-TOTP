"""Tokens de acceso (JWT firmado con HS256) y refresh tokens opacos."""

from __future__ import annotations

import hashlib
import secrets
import time
from typing import Any

import jwt

from app.config import Settings

ALGORITHM = "HS256"


class InvalidToken(Exception):
    """El token falta, está mal firmado, venció o no es del tipo esperado."""


def create_jwt(settings: Settings, *, sub: str, token_type: str, ttl: int, claims: dict[str, Any] | None = None) -> str:
    now = int(time.time())
    payload = {
        "iss": settings.jwt_issuer,
        "sub": sub,
        "token_type": token_type,
        "iat": now,
        "exp": now + ttl,
        "jti": secrets.token_urlsafe(8),
        **(claims or {}),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_jwt(settings: Settings, token: str, *, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[ALGORITHM],  # lista fija: evita el ataque de "alg: none"
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "sub", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise InvalidToken("El token venció.") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidToken("Token inválido.") from exc

    if payload.get("token_type") != expected_type:
        raise InvalidToken("Tipo de token incorrecto.")
    return payload


def create_access_token(settings: Settings, user_id: str, *, mfa_verified: bool = False) -> str:
    return create_jwt(
        settings,
        sub=user_id,
        token_type="access",
        ttl=settings.access_token_ttl,
        claims={"mfa_verified": mfa_verified},
    )


def create_step_up_token(settings: Settings, user_id: str) -> str:
    """Token temporal que solo sirve para POST /auth/mfa/verify (no da acceso a la API)."""
    return create_jwt(settings, sub=user_id, token_type="step_up", ttl=settings.step_up_token_ttl)


def create_elevated_token(settings: Settings, user_id: str) -> str:
    """Access token con privilegios elevados: mfa_verified=true, 10 min. amr = métodos usados (RFC 8176)."""
    return create_jwt(
        settings,
        sub=user_id,
        token_type="access",
        ttl=settings.elevated_token_ttl,
        claims={"mfa_verified": True, "amr": ["pwd", "otp"], "auth_time": int(time.time())},
    )


def new_opaque_token() -> str:
    """Valor aleatorio de 256 bits para refresh tokens y códigos de autorización."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """En memoria se guarda solo el hash: si se filtra el almacén, los tokens no sirven."""
    return hashlib.sha256(token.encode()).hexdigest()
