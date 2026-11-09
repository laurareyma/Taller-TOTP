from dataclasses import replace

from app.security.tokens import create_access_token, create_jwt
from tests.conftest import USERNAME, full_login


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_me_con_access_token(client):
    tokens = full_login(client)
    response = client.get("/api/me", headers=bearer(tokens["access_token"]))
    assert response.status_code == 200
    assert response.json()["username"] == USERNAME
    assert response.json()["mfa_verified"] is False


def test_sin_token_responde_401_con_www_authenticate(client):
    response = client.get("/api/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Bearer")
    assert response.json()["error"] == "invalid_token"


def test_token_vencido_responde_401(client, settings, store):
    user_id = next(iter(store.users))
    expired = create_access_token(replace(settings, access_token_ttl=-10), user_id)
    response = client.get("/api/me", headers=bearer(expired))
    assert response.status_code == 401
    assert "venció" in response.json()["error_description"]


def test_token_con_otra_firma_o_tipo_responde_401(client, settings, store):
    user_id = next(iter(store.users))
    forged = create_access_token(replace(settings, jwt_secret="otra-llave-de-al-menos-32-bytes-xx"), user_id)
    assert client.get("/api/me", headers=bearer(forged)).status_code == 401

    wrong_type = create_jwt(settings, sub=user_id, token_type="step_up", ttl=60)
    assert client.get("/api/me", headers=bearer(wrong_type)).status_code == 401


def test_refresh_token_no_sirve_como_access_token(client):
    tokens = full_login(client)
    assert client.get("/api/me", headers=bearer(tokens["refresh_token"])).status_code == 401


def test_alias_boveda_responde_403(client):
    tokens = full_login(client)
    res1 = client.get("/api/boveda-critica", headers=bearer(tokens["access_token"]))
    res2 = client.get("/api/boveda", headers=bearer(tokens["access_token"]))
    assert res1.status_code == 403
    assert res2.status_code == 403
    assert res1.json()["error"] == res2.json()["error"] == "mfa_required"

