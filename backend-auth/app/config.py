"""Configuración leída de variables de entorno (o del archivo backend-auth/.env)."""

from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

log = logging.getLogger("uvicorn.error")

PLACEHOLDER_SECRET = "cambia-esto"


@dataclass(frozen=True)
class Settings:
    jwt_secret: str
    jwt_issuer: str = "unisabana-auth"

    # Duraciones en segundos
    access_token_ttl: int = 300  # 5 min
    refresh_token_ttl: int = 30 * 24 * 3600  # 30 días
    elevated_token_ttl: int = 600  # 10 min
    step_up_token_ttl: int = 120
    auth_code_ttl: int = 60  # el código de autorización es de un solo uso y vive poco
    login_request_ttl: int = 600  # tiempo para completar el formulario de login

    # Step-Up 2FA
    totp_window: int = 1  # acepta C-1, C y C+1
    replay_ttl: int = 90  # cuánto se recuerda un código ya usado (3 ventanas de 30 s)
    mfa_max_attempts: int = 5  # intentos permitidos por step_up_token
    mfa_user_max_attempts: int = 10  # intentos por usuario en la ventana, aunque pida step_up_tokens nuevos
    mfa_user_window: int = 900  # 15 min

    # Cliente público registrado (la app móvil). No tiene client_secret: por eso PKCE.
    client_id: str = "unisabana-mobile"
    redirect_uris: tuple[str, ...] = (
        "unisabana-auth://oauth/callback",
        "unisabana-auth://callback",
    )

    # Usuario de demostración
    demo_username: str = "estudiante@unisabana.edu.co"
    demo_password: str = "Sabana2026!"
    demo_totp_secret: str = "JBSWY3DPEHPK3PXP"


def _int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value else default


def load_settings() -> Settings:
    defaults = Settings(jwt_secret="")

    jwt_secret = os.getenv("JWT_SECRET", "")
    if not jwt_secret or jwt_secret == PLACEHOLDER_SECRET:
        # Sin llave configurada se genera una al azar: los tokens dejan de servir al reiniciar.
        jwt_secret = secrets.token_urlsafe(32)
        log.warning("JWT_SECRET no está configurado en .env: se generó una llave temporal.")

    redirect_env = os.getenv("REDIRECT_URIS") or os.getenv("REDIRECT_URI")
    redirect_uris = (
        tuple(uri.strip() for uri in redirect_env.split(",") if uri.strip()) if redirect_env else defaults.redirect_uris
    )

    return Settings(
        jwt_secret=jwt_secret,
        access_token_ttl=_int("ACCESS_TOKEN_TTL", defaults.access_token_ttl),
        refresh_token_ttl=_int("REFRESH_TOKEN_TTL", defaults.refresh_token_ttl),
        elevated_token_ttl=_int("ELEVATED_TOKEN_TTL", defaults.elevated_token_ttl),
        step_up_token_ttl=_int("STEP_UP_TOKEN_TTL", defaults.step_up_token_ttl),
        client_id=os.getenv("CLIENT_ID", defaults.client_id),
        redirect_uris=redirect_uris,
        demo_username=os.getenv("DEMO_USERNAME", defaults.demo_username),
        demo_password=os.getenv("DEMO_PASSWORD", defaults.demo_password),
        demo_totp_secret=os.getenv("DEMO_TOTP_SECRET", defaults.demo_totp_secret),
    )
