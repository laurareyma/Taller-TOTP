"""Endpoint de autorización (RFC 6749 §4.1 + RFC 7636).

GET  /oauth/authorize  → valida la solicitud de la app y muestra el login.
POST /oauth/authorize  → valida credenciales y redirige al deep link con ?code=...&state=...
"""

from __future__ import annotations

from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Form
from fastapi.responses import RedirectResponse, Response

from app.context import Ctx
from app.pages import error_page, login_page
from app.security import pkce

router = APIRouter(prefix="/oauth", tags=["oauth"])


def _redirect(redirect_uri: str, params: dict[str, str]) -> RedirectResponse:
    """Vuelve a la app por el deep link. 303 obliga al navegador a usar GET tras el POST del formulario."""
    separator = "&" if "?" in redirect_uri else "?"
    clean = {k: v for k, v in params.items() if v}
    return RedirectResponse(f"{redirect_uri}{separator}{urlencode(clean)}", status_code=303, headers={"Cache-Control": "no-store"})


@router.get("/authorize")
def authorize(
    ctx: Ctx,
    response_type: str | None = None,
    client_id: str | None = None,
    redirect_uri: str | None = None,
    state: str | None = None,
    code_challenge: str | None = None,
    code_challenge_method: str | None = None,
) -> Response:
    settings = ctx.settings

    # Si el cliente o el redirect_uri no son los registrados, NO se redirige: podría ser un atacante (RFC 6749 §4.1.2.1).
    if client_id != settings.client_id:
        return error_page("Aplicación cliente desconocida.")
    if redirect_uri not in settings.redirect_uris:
        return error_page("redirect_uri no registrado para esta aplicación.")

    # El resto de errores se devuelven a la app por el deep link.
    def fail(description: str, error: str = "invalid_request") -> RedirectResponse:
        return _redirect(redirect_uri, {"error": error, "error_description": description, "state": state or ""})

    if response_type != "code":
        return fail("response_type debe ser 'code'.", "unsupported_response_type")
    if not state:
        return fail("Falta el parámetro state.")
    if code_challenge_method != "S256":
        return fail("code_challenge_method debe ser S256.")
    if not code_challenge or not pkce.is_valid_challenge(code_challenge):
        return fail("code_challenge inválido o ausente.")

    request = ctx.store.create_login_request(
        client_id=client_id,
        redirect_uri=redirect_uri,
        state=state,
        code_challenge=code_challenge,
        ttl=settings.login_request_ttl,
    )
    return login_page(request.id)


@router.post("/authorize")
def authorize_submit(
    ctx: Ctx,
    request_id: Annotated[str, Form()] = "",
    username: Annotated[str, Form()] = "",
    password: Annotated[str, Form()] = "",
    action: Annotated[str, Form()] = "login",
) -> Response:
    store = ctx.store
    request = store.get_login_request(request_id)
    if request is None:
        return error_page("La solicitud de inicio de sesión expiró.")

    if action == "cancel":
        store.remove_login_request(request.id)
        return _redirect(request.redirect_uri, {"error": "access_denied", "error_description": "El usuario canceló.", "state": request.state})

    user = store.authenticate(username, password)
    if user is None:
        return login_page(request.id, username=username, error="Correo o contraseña incorrectos.", status=401)

    # Una solicitud solo produce un código, aunque el formulario se envíe dos veces a la vez.
    request = store.take_login_request(request.id)
    if request is None:
        return error_page("La solicitud de inicio de sesión expiró.")
    code = store.create_code(request, user, ttl=ctx.settings.auth_code_ttl)
    return _redirect(request.redirect_uri, {"code": code, "state": request.state})
