from dataclasses import replace

import jwt
import pytest

from app.security import totp
from app.security.tokens import create_access_token, create_step_up_token
from tests.conftest import full_login

SECRET = "JBSWY3DPEHPK3PXP"  # semilla del usuario demo (Settings por defecto)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def code_at(clock, delta: int = 0) -> str:
    """Código que mostraría el Authenticator en la ventana actual (+ delta)."""
    return totp.hotp(totp.decode_secret(SECRET), totp.time_step(clock.now) + delta)


@pytest.fixture
def access_token(client) -> str:
    return full_login(client)["access_token"]


def step_up(client, access_token: str) -> str:
    response = client.get("/api/boveda-critica", headers=bearer(access_token))
    assert response.status_code == 403
    return response.json()["step_up_token"]


def verify(client, step_up_token: str, code: str):
    return client.post("/auth/mfa/verify", json={"step_up_token": step_up_token, "code": code})


# ---------- Bóveda ----------


def test_boveda_con_token_normal_exige_mfa(client, access_token, settings):
    response = client.get("/api/boveda-critica", headers=bearer(access_token))
    assert response.status_code == 403
    body = response.json()
    assert body["error"] == "mfa_required"
    assert body["step_up_expires_in"] == settings.step_up_token_ttl
    assert jwt.decode(body["step_up_token"], settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer)[
        "token_type"
    ] == "step_up"
    assert "insufficient_user_authentication" in response.headers["www-authenticate"]


def test_boveda_sin_token_responde_401(client):
    assert client.get("/api/boveda-critica").status_code == 401


def test_flujo_completo_step_up(client, access_token, clock, settings):
    response = verify(client, step_up(client, access_token), code_at(clock))
    assert response.status_code == 200
    elevated = response.json()["elevated_token"]
    assert response.json()["expires_in"] == settings.elevated_token_ttl

    claims = jwt.decode(elevated, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer)
    assert claims["mfa_verified"] is True
    assert claims["exp"] - claims["iat"] == settings.elevated_token_ttl
    assert claims["amr"] == ["pwd", "otp"]

    vault = client.get("/api/boveda-critica", headers=bearer(elevated))
    assert vault.status_code == 200
    assert len(vault.json()["items"]) > 0


def test_elevated_token_vencido_vuelve_a_401(client, settings, store):
    user_id = next(iter(store.users))
    expired = create_access_token(replace(settings, access_token_ttl=-1), user_id, mfa_verified=True)
    assert client.get("/api/boveda-critica", headers=bearer(expired)).status_code == 401


# ---------- Clock skew ----------


@pytest.mark.parametrize("delta", [-1, 1])
def test_tolera_una_ventana_de_desfase(client, access_token, clock, delta):
    assert verify(client, step_up(client, access_token), code_at(clock, delta)).status_code == 200


@pytest.mark.parametrize("delta", [-2, 2])
def test_rechaza_dos_ventanas_de_desfase(client, access_token, clock, delta):
    response = verify(client, step_up(client, access_token), code_at(clock, delta))
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_code"


# ---------- Anti-Replay ----------


def test_reusar_el_codigo_responde_409(client, access_token, clock):
    code = code_at(clock)
    assert verify(client, step_up(client, access_token), code).status_code == 200

    # Mismo código, aunque sea con un step_up_token nuevo.
    replay = verify(client, step_up(client, access_token), code)
    assert replay.status_code == 409
    assert replay.json()["error"] == "replay_detected"
    assert "Replay Attack Detected" in replay.json()["error_description"]


def test_tras_el_replay_el_codigo_siguiente_funciona(client, access_token, clock):
    assert verify(client, step_up(client, access_token), code_at(clock)).status_code == 200
    clock.now += 30
    assert verify(client, step_up(client, access_token), code_at(clock)).status_code == 200


def test_la_cache_anti_replay_expira_a_los_90_segundos(store, clock):
    assert store.mark_otp_used("u1", 100, ttl=90) is True
    assert store.mark_otp_used("u1", 100, ttl=90) is False
    clock.now += 91
    assert store.mark_otp_used("u1", 100, ttl=90) is True
    assert store.mark_otp_used("u2", 100, ttl=90) is True  # otro usuario no se ve afectado


# ---------- Errores y fuerza bruta ----------


def test_codigo_incorrecto_descuenta_intentos_y_luego_bloquea(client, access_token, clock, settings):
    token = step_up(client, access_token)
    wrong = "000000" if code_at(clock) != "000000" else "111111"
    for attempt in range(settings.mfa_max_attempts):
        response = verify(client, token, wrong)
        assert response.status_code == 400
        assert response.json()["attempts_left"] == settings.mfa_max_attempts - attempt - 1

    blocked = verify(client, token, code_at(clock))  # ni siquiera el código correcto
    assert blocked.status_code == 429


@pytest.mark.parametrize("code", ["12345", "1234567", "abcdef", "", "١٢٣٤٥٦", "１２３４５６"])
def test_formato_invalido(client, access_token, code):
    response = verify(client, step_up(client, access_token), code)
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_request"


def test_step_up_token_invalido_vencido_o_de_otro_tipo(client, access_token, clock, settings, store):
    user_id = next(iter(store.users))
    expired = create_step_up_token(replace(settings, step_up_token_ttl=-1), user_id)
    assert verify(client, expired, code_at(clock)).status_code == 401
    assert verify(client, "inventado", code_at(clock)).status_code == 401
    assert verify(client, access_token, code_at(clock)).status_code == 401  # un access token no sirve


def test_step_up_token_no_sirve_como_bearer(client, access_token):
    token = step_up(client, access_token)
    assert client.get("/api/boveda-critica", headers=bearer(token)).status_code == 401
    assert client.get("/api/me", headers=bearer(token)).status_code == 401


def test_limite_por_usuario_aunque_pida_step_up_tokens_nuevos(client, access_token, clock, settings):
    wrong = "000000" if code_at(clock) != "000000" else "111111"
    for _ in range(settings.mfa_user_max_attempts):
        assert verify(client, step_up(client, access_token), wrong).status_code == 400

    # Un step_up_token nuevo ya no reinicia el contador: ni el código correcto pasa.
    blocked = verify(client, step_up(client, access_token), code_at(clock))
    assert blocked.status_code == 429
    assert blocked.json()["error"] == "too_many_attempts"
    assert 0 < int(blocked.headers["retry-after"]) <= settings.mfa_user_window

    clock.now += settings.mfa_user_window + 1
    assert verify(client, step_up(client, access_token), code_at(clock)).status_code == 200


def test_un_codigo_correcto_reinicia_el_contador_del_usuario(client, access_token, clock, settings):
    wrong = "000000" if code_at(clock) != "000000" else "111111"
    for _ in range(settings.mfa_user_max_attempts - 1):
        verify(client, step_up(client, access_token), wrong)
    assert verify(client, step_up(client, access_token), code_at(clock)).status_code == 200

    response = verify(client, step_up(client, access_token), wrong)
    assert response.status_code == 400
    assert response.json()["attempts_left"] == settings.mfa_max_attempts - 1
