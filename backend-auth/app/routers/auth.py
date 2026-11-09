"""Emisión y renovación de tokens.

POST /auth/oauth/token  → canjea code + code_verifier por access_token + refresh_token (RFC 6749 §4.1.3)
POST /auth/refresh      → rota el refresh_token y entrega un access_token nuevo
POST /auth/logout       → revoca la sesión
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Form, Response
from pydantic import BaseModel

from app.context import ApiError, Ctx
from app.security import pkce
from app.security.tokens import create_access_token
from app.store import GrantError

router = APIRouter(prefix="/auth", tags=["auth"])

NO_CACHE = {"Cache-Control": "no-store", "Pragma": "no-cache"}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    refresh_token: str
    refresh_expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


def _tokens(ctx: Ctx, user_id: str, refresh_token: str) -> TokenResponse:
    settings = ctx.settings
    return TokenResponse(
        access_token=create_access_token(settings, user_id),
        expires_in=settings.access_token_ttl,
        refresh_token=refresh_token,
        refresh_expires_in=settings.refresh_token_ttl,
    )


@router.post("/oauth/token", response_model=TokenResponse)
def token(
    ctx: Ctx,
    response: Response,
    grant_type: Annotated[str, Form()] = "",
    code: Annotated[str, Form()] = "",
    redirect_uri: Annotated[str, Form()] = "",
    client_id: Annotated[str, Form()] = "",
    code_verifier: Annotated[str, Form()] = "",
) -> TokenResponse:
    """El cuerpo va como application/x-www-form-urlencoded, como pide el RFC 6749."""
    if grant_type != "authorization_code":
        raise ApiError(400, "unsupported_grant_type", "grant_type debe ser authorization_code.")
    if not (code and redirect_uri and client_id and code_verifier):
        raise ApiError(400, "invalid_request", "Faltan code, redirect_uri, client_id o code_verifier.")

    try:
        record = ctx.store.consume_code(code)
    except GrantError as exc:
        raise ApiError(400, "invalid_grant", str(exc)) from exc

    if record.client_id != client_id or record.redirect_uri != redirect_uri:
        raise ApiError(400, "invalid_grant", "El código no corresponde a este cliente o redirect_uri.")

    # Paso clave de PKCE: solo quien generó el code_verifier original puede canjear el código.
    if not pkce.verify(code_verifier, record.code_challenge):
        raise ApiError(400, "invalid_grant", "Verificación PKCE fallida: SHA256(code_verifier) ≠ code_challenge.")

    refresh_token, family_id = ctx.store.issue_refresh_token(record.user_id, ctx.settings.refresh_token_ttl)
    record.family_id = family_id
    response.headers.update(NO_CACHE)
    return _tokens(ctx, record.user_id, refresh_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(ctx: Ctx, body: RefreshRequest, response: Response) -> TokenResponse:
    try:
        user_id, new_refresh = ctx.store.rotate_refresh_token(body.refresh_token, ctx.settings.refresh_token_ttl)
    except GrantError as exc:
        # La app debe borrar sus tokens y volver al login.
        raise ApiError(401, "invalid_grant", str(exc)) from exc
    response.headers.update(NO_CACHE)
    return _tokens(ctx, user_id, new_refresh)


@router.post("/logout", status_code=204)
def logout(ctx: Ctx, body: RefreshRequest) -> Response:
    ctx.store.revoke_refresh_token(body.refresh_token)
    return Response(status_code=204)
