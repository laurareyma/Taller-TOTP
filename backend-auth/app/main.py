"""Backend de autorización del taller (FastAPI).

Ejecutar:  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging

from fastapi import FastAPI

from app.config import Settings, load_settings
from app.context import ApiError, AppContext, api_error_handler
from app.routers import api, auth, mfa, oauth
from app.store import Store

log = logging.getLogger("uvicorn.error")


def create_app(settings: Settings | None = None, store: Store | None = None) -> FastAPI:
    settings = settings or load_settings()
    store = store or Store()
    store.add_user(settings.demo_username, settings.demo_password, settings.demo_totp_secret)

    app = FastAPI(title="UniSabana Auth")
    app.state.ctx = AppContext(settings=settings, store=store)
    app.add_exception_handler(ApiError, api_error_handler)
    app.include_router(oauth.router)
    app.include_router(auth.router)
    app.include_router(mfa.router)
    app.include_router(api.router)

    @app.get("/health", tags=["health"])
    def health() -> dict:
        return {"status": "ok"}

    log.info("Cliente %s · redirect_uris %s", settings.client_id, ", ".join(settings.redirect_uris))
    log.info("Usuario demo: %s · access_token %ss", settings.demo_username, settings.access_token_ttl)
    return app


app = create_app()
