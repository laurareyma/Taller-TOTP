"""Recursos protegidos por access token.

GET /api/me              → recurso normal (sirve para probar el Silent Refresh).
GET /api/boveda-critica  → exige un token elevado (mfa_verified=true). Si no, 403 mfa_required + step_up_token.
"""

from __future__ import annotations

import time

from fastapi import APIRouter

from app.context import AccessClaims, ApiError, Ctx
from app.security.tokens import create_step_up_token
from app.store import User

router = APIRouter(prefix="/api", tags=["api"])


def _current_user(ctx: Ctx, claims: dict) -> User:
    user = ctx.store.users.get(claims["sub"])
    if user is None:
        raise ApiError(401, "invalid_token", "El usuario ya no existe.", headers={"WWW-Authenticate": "Bearer"})
    return user


@router.get("/me")
def me(ctx: Ctx, claims: AccessClaims) -> dict:
    user = _current_user(ctx, claims)
    return {
        "id": user.id,
        "username": user.username,
        "mfa_verified": bool(claims.get("mfa_verified")),
        "token_expires_at": claims["exp"],
    }


@router.get("/boveda-critica")
@router.get("/boveda")
def boveda_critica(ctx: Ctx, claims: AccessClaims) -> dict:
    user = _current_user(ctx, claims)

    if claims.get("mfa_verified") is not True:
        # Step-Up: el token es válido pero insuficiente. 403 (no 401): la sesión sigue viva,
        # solo falta el segundo factor. La cabecera sigue el RFC 9470.
        raise ApiError(
            403,
            "mfa_required",
            "Esta operación requiere verificación en dos pasos.",
            headers={"WWW-Authenticate": 'Bearer error="insufficient_user_authentication"'},
            step_up_token=create_step_up_token(ctx.settings, user.id),
            step_up_expires_in=ctx.settings.step_up_token_ttl,
        )

    return {
        "owner": user.username,
        "unlocked_at": int(time.time()),
        "elevated_until": claims["exp"],
        "items": [
            {"label": "Cuenta de nómina", "value": "Bancolombia •••• 4821"},
            {"label": "Saldo disponible", "value": "$ 12.480.000"},
            {"label": "Códigos de recuperación", "value": "7F3K-9Q2M · H8D1-XP4T"},
            {"label": "Llave de firma digital", "value": "SHA256:9c1f…e07a"},
        ],
    }
