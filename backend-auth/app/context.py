"""Estado compartido de la app (configuración + almacén) y dependencias comunes de FastAPI."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from app.config import Settings
from app.security.tokens import InvalidToken, decode_jwt
from app.store import Store


@dataclass
class AppContext:
    settings: Settings
    store: Store


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx


Ctx = Annotated[AppContext, Depends(get_ctx)]


class ApiError(Exception):
    """Error con formato OAuth: {"error": ..., "error_description": ...}."""

    def __init__(self, status: int, error: str, description: str, *, headers: dict[str, str] | None = None, **extra: Any):
        self.status = status
        self.body = {"error": error, "error_description": description, **extra}
        self.headers = headers or {}


def api_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return JSONResponse(exc.body, status_code=exc.status, headers={"Cache-Control": "no-store", **exc.headers})


def require_access_token(request: Request, ctx: Ctx) -> dict[str, Any]:
    """Exige `Authorization: Bearer <access_token>` válido. Si falta o venció responde 401."""
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "invalid_token", "Falta el access token.", headers={"WWW-Authenticate": "Bearer"})
    try:
        return decode_jwt(ctx.settings, token, expected_type="access")
    except InvalidToken as exc:
        # El detalle va en el cuerpo JSON; la cabecera solo admite ASCII.
        raise ApiError(401, "invalid_token", str(exc), headers={"WWW-Authenticate": 'Bearer error="invalid_token"'}) from exc


AccessClaims = Annotated[dict[str, Any], Depends(require_access_token)]
