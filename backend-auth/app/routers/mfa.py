"""Verificación del segundo factor (Step-Up).

POST /auth/mfa/verify  {step_up_token, code}  →  {elevated_token}

Respuestas de error:
  401 invalid_token       step_up_token inválido o vencido
  400 invalid_request     el código no tiene 6 dígitos
  400 invalid_code        código incorrecto (se cuenta el intento)
  429 too_many_attempts   5 intentos con este step_up_token, o 10 del usuario en 15 min
  409 replay_detected     el código ya se usó (Anti-Replay)
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.context import ApiError, Ctx
from app.security import totp
from app.security.tokens import InvalidToken, create_elevated_token, decode_jwt

router = APIRouter(prefix="/auth/mfa", tags=["mfa"])

# [0-9] y no \d: en Python \d también acepta dígitos de otros alfabetos (p. ej. "١٢٣٤٥٦").
CODE_PATTERN = re.compile(r"[0-9]{6}")


class VerifyRequest(BaseModel):
    step_up_token: str
    code: str


class ElevatedResponse(BaseModel):
    elevated_token: str
    token_type: str = "Bearer"
    expires_in: int


@router.post("/verify", response_model=ElevatedResponse)
def verify(ctx: Ctx, body: VerifyRequest, response: Response) -> ElevatedResponse:
    settings, store = ctx.settings, ctx.store

    # 1. El step_up_token prueba que el usuario ya pasó el primer factor (y es reciente).
    try:
        claims = decode_jwt(settings, body.step_up_token, expected_type="step_up")
    except InvalidToken as exc:
        raise ApiError(401, "invalid_token", f"step_up_token: {exc} Vuelve a abrir la bóveda.") from exc

    user = store.users.get(claims["sub"])
    if user is None:
        raise ApiError(401, "invalid_token", "El usuario ya no existe.")

    code = body.code.strip()
    if CODE_PATTERN.fullmatch(code) is None:
        raise ApiError(400, "invalid_request", "El código debe tener 6 dígitos.")

    # 2. Límite de intentos: sin él, 10^6 combinaciones se podrían probar por fuerza bruta.
    #    Se cuenta por step_up_token y también por usuario (pedir tokens nuevos no reinicia el contador).
    #    El intento se reserva antes de comparar: varias peticiones en paralelo no superan el límite.
    jti = claims["jti"]
    limits = {
        "max_per_token": settings.mfa_max_attempts,
        "max_per_user": settings.mfa_user_max_attempts,
        "window": settings.mfa_user_window,
    }
    reserved = store.reserve_mfa_attempt(user.id, jti, float(claims["exp"]), **limits)
    if reserved == "token_limit":
        raise ApiError(429, "too_many_attempts", "Demasiados intentos. Vuelve a abrir la bóveda.")
    if reserved == "user_limit":
        retry_after = store.mfa_retry_after(user.id, settings.mfa_user_window)
        raise ApiError(
            429,
            "too_many_attempts",
            f"Demasiados intentos fallidos. Espera {max(1, round(retry_after / 60))} min antes de volver a intentar.",
            headers={"Retry-After": str(retry_after)},
        )

    # 3. TOTP con tolerancia de reloj: ventanas C-1, C y C+1.
    counter = totp.match_counter(user.totp_secret, code, store.clock(), window=settings.totp_window)
    if counter is None:
        raise ApiError(
            400,
            "invalid_code",
            "Código incorrecto.",
            attempts_left=store.mfa_attempts_left(user.id, jti, **limits),
        )

    # 4. Anti-Replay: cada ventana de tiempo solo se acepta una vez por usuario (TTL 90 s).
    if not store.mark_otp_used(user.id, counter, settings.replay_ttl):
        raise ApiError(409, "replay_detected", "Replay Attack Detected: este código ya fue usado. Espera el siguiente.")

    store.forget_mfa_attempts(user.id)  # código correcto: se reinicia el contador del usuario

    response.headers["Cache-Control"] = "no-store"
    return ElevatedResponse(elevated_token=create_elevated_token(settings, user.id), expires_in=settings.elevated_token_ttl)
