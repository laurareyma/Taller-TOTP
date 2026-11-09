from __future__ import annotations

import base64
import re
import secrets
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.security.pkce import s256_challenge
from app.store import Store

REDIRECT_URI = "unisabana-auth://oauth/callback"
CLIENT_ID = "unisabana-mobile"
USERNAME = "estudiante@unisabana.edu.co"
PASSWORD = "Sabana2026!"


class FakeClock:
    def __init__(self) -> None:
        self.now = 1_700_000_000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def settings() -> Settings:
    return Settings(jwt_secret="secreto-de-pruebas-de-al-menos-32-bytes!")


@pytest.fixture
def store(clock: FakeClock) -> Store:
    return Store(clock=clock)


@pytest.fixture
def client(settings: Settings, store: Store) -> TestClient:
    # No se siguen redirecciones: el destino es un deep link de la app.
    return TestClient(create_app(settings, store), follow_redirects=False)


def new_verifier() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()


def authorize_params(verifier: str, **overrides: str) -> dict[str, str]:
    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "state": "estado-aleatorio-123",
        "code_challenge": s256_challenge(verifier),
        "code_challenge_method": "S256",
    }
    params.update(overrides)
    return params


def redirect_query(response) -> dict[str, str]:
    location = response.headers["location"]
    assert location.startswith(REDIRECT_URI)
    return {k: v[0] for k, v in parse_qs(urlsplit(location).query).items()}


def start_login(client: TestClient, verifier: str) -> str:
    """Hace GET /oauth/authorize y devuelve el request_id del formulario."""
    page = client.get("/oauth/authorize", params=authorize_params(verifier))
    assert page.status_code == 200
    return re.search(r'name="request_id" value="([^"]+)"', page.text).group(1)


def login(client: TestClient, verifier: str) -> str:
    """Completa el login y devuelve el authorization code."""
    request_id = start_login(client, verifier)
    response = client.post(
        "/oauth/authorize", data={"request_id": request_id, "username": USERNAME, "password": PASSWORD, "action": "login"}
    )
    assert response.status_code == 303
    return redirect_query(response)["code"]


def exchange(client: TestClient, code: str, verifier: str, **overrides: str):
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "code_verifier": verifier,
    }
    data.update(overrides)
    return client.post("/auth/oauth/token", data=data)


def full_login(client: TestClient) -> dict:
    verifier = new_verifier()
    response = exchange(client, login(client, verifier), verifier)
    assert response.status_code == 200
    return response.json()
