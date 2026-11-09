import jwt

from tests.conftest import exchange, full_login, login, new_verifier


def test_canje_correcto_entrega_tokens(client, settings):
    verifier = new_verifier()
    response = exchange(client, login(client, verifier), verifier)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"

    body = response.json()
    assert body["token_type"] == "Bearer"
    assert body["expires_in"] == settings.access_token_ttl
    claims = jwt.decode(body["access_token"], settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer)
    assert claims["token_type"] == "access"
    assert claims["mfa_verified"] is False
    assert claims["exp"] - claims["iat"] == settings.access_token_ttl


def test_verifier_incorrecto_es_rechazado(client):
    code = login(client, new_verifier())
    response = exchange(client, code, new_verifier())  # un atacante con el code pero sin el verifier
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_grant"
    assert "PKCE" in response.json()["error_description"]


def test_el_code_es_de_un_solo_uso_y_reusarlo_revoca_la_sesion(client):
    verifier = new_verifier()
    code = login(client, verifier)
    first = exchange(client, code, verifier).json()

    second = exchange(client, code, verifier)
    assert second.status_code == 400
    assert second.json()["error"] == "invalid_grant"

    # El refresh token del primer canje queda revocado (RFC 6749 §4.1.2).
    assert client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401


def test_el_code_vence(client, clock, settings):
    verifier = new_verifier()
    code = login(client, verifier)
    clock.now += settings.auth_code_ttl + 1
    assert exchange(client, code, verifier).json()["error"] == "invalid_grant"


def test_redirect_uri_o_client_id_distintos(client):
    verifier = new_verifier()
    assert exchange(client, login(client, verifier), verifier, redirect_uri="otra://x").json()["error"] == "invalid_grant"
    verifier = new_verifier()
    assert exchange(client, login(client, verifier), verifier, client_id="otra-app").json()["error"] == "invalid_grant"


def test_grant_type_y_campos_obligatorios(client):
    assert exchange(client, "x", new_verifier(), grant_type="password").json()["error"] == "unsupported_grant_type"
    assert exchange(client, "", new_verifier()).json()["error"] == "invalid_request"


def test_refresh_rota_el_token(client):
    tokens = full_login(client)
    response = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 200
    renewed = response.json()
    assert renewed["refresh_token"] != tokens["refresh_token"]
    assert renewed["access_token"] != tokens["access_token"]


def test_reusar_un_refresh_token_revoca_toda_la_familia(client):
    tokens = full_login(client)
    renewed = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).json()

    # Alguien usa el token viejo (robado): se rechaza...
    stolen = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert stolen.status_code == 401
    # ...y el token legítimo más reciente también deja de servir.
    assert client.post("/auth/refresh", json={"refresh_token": renewed["refresh_token"]}).status_code == 401


def test_refresh_vencido_o_inventado(client, clock, settings):
    tokens = full_login(client)
    clock.now += settings.refresh_token_ttl + 1
    assert client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": "inventado"}).status_code == 401


def test_logout_revoca_la_sesion(client):
    tokens = full_login(client)
    assert client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]}).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
