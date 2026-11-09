import pytest

from tests.conftest import PASSWORD, USERNAME, authorize_params, new_verifier, redirect_query, start_login


def test_get_muestra_el_formulario_con_cabeceras_de_seguridad(client):
    response = client.get("/oauth/authorize", params=authorize_params(new_verifier()))
    assert response.status_code == 200
    assert 'name="request_id"' in response.text
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "override",
    [{"client_id": "otra-app"}, {"redirect_uri": "https://atacante.example/callback"}],
)
def test_cliente_o_redirect_desconocido_no_redirige(client, override):
    response = client.get("/oauth/authorize", params=authorize_params(new_verifier(), **override))
    assert response.status_code == 400
    assert "location" not in response.headers


@pytest.mark.parametrize(
    ("override", "error"),
    [
        ({"response_type": "token"}, "unsupported_response_type"),
        ({"code_challenge_method": "plain"}, "invalid_request"),
        ({"code_challenge": "corto"}, "invalid_request"),
        ({"code_challenge": ""}, "invalid_request"),
    ],
)
def test_errores_de_solicitud_vuelven_a_la_app_con_state(client, override, error):
    response = client.get("/oauth/authorize", params=authorize_params(new_verifier(), **override))
    assert response.status_code == 303
    query = redirect_query(response)
    assert query["error"] == error
    assert query["state"] == "estado-aleatorio-123"


def test_falta_state(client):
    response = client.get("/oauth/authorize", params=authorize_params(new_verifier(), state=""))
    assert redirect_query(response)["error"] == "invalid_request"


def test_login_correcto_redirige_con_code_y_el_mismo_state(client):
    request_id = start_login(client, new_verifier())
    response = client.post("/oauth/authorize", data={"request_id": request_id, "username": USERNAME, "password": PASSWORD})
    assert response.status_code == 303
    query = redirect_query(response)
    assert len(query["code"]) >= 40
    assert query["state"] == "estado-aleatorio-123"


def test_contrasena_incorrecta_vuelve_a_mostrar_el_formulario(client):
    request_id = start_login(client, new_verifier())
    response = client.post("/oauth/authorize", data={"request_id": request_id, "username": USERNAME, "password": "mala"})
    assert response.status_code == 401
    assert "incorrectos" in response.text
    assert "location" not in response.headers


def test_cancelar_devuelve_access_denied(client):
    request_id = start_login(client, new_verifier())
    response = client.post("/oauth/authorize", data={"request_id": request_id, "action": "cancel"})
    assert redirect_query(response)["error"] == "access_denied"


def test_la_solicitud_de_login_solo_sirve_una_vez(client):
    request_id = start_login(client, new_verifier())
    data = {"request_id": request_id, "username": USERNAME, "password": PASSWORD}
    assert client.post("/oauth/authorize", data=data).status_code == 303
    assert client.post("/oauth/authorize", data=data).status_code == 400


def test_la_solicitud_de_login_expira(client, clock, settings):
    request_id = start_login(client, new_verifier())
    clock.now += settings.login_request_ttl + 1
    response = client.post("/oauth/authorize", data={"request_id": request_id, "username": USERNAME, "password": PASSWORD})
    assert response.status_code == 400
    assert "expiró" in response.text
