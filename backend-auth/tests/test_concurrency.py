"""Peticiones simultáneas: el Anti-Replay y los límites deben resistir hilos en paralelo.

FastAPI atiende las rutas síncronas en un pool de hilos; sin el candado del Store,
dos envíos simultáneos del mismo código TOTP podían ser aceptados los dos.
"""

import sys
import threading

import pytest

from app.security import totp
from tests.conftest import full_login, new_verifier, start_login

SECRET = "JBSWY3DPEHPK3PXP"


@pytest.fixture(autouse=True)
def cambios_de_hilo_frecuentes():
    """Hace que Python cambie de hilo muy seguido: así la carrera aparecería si existiera."""
    previous = sys.getswitchinterval()
    sys.setswitchinterval(1e-6)
    yield
    sys.setswitchinterval(previous)


def run_in_parallel(n: int, fn) -> list:
    barrier = threading.Barrier(n)
    results: list = []
    lock = threading.Lock()

    def worker(i: int) -> None:
        barrier.wait()
        value = fn(i)
        with lock:
            results.append(value)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def test_mark_otp_used_solo_acepta_una_vez_con_hilos(store):
    for counter in range(300):
        results = run_in_parallel(8, lambda _: store.mark_otp_used("u1", counter, ttl=90))
        assert results.count(True) == 1


def test_mismo_codigo_en_paralelo_solo_una_peticion_gana(client, clock):
    access = full_login(client)["access_token"]
    headers = {"Authorization": f"Bearer {access}"}
    tokens = [client.get("/api/boveda-critica", headers=headers).json()["step_up_token"] for _ in range(8)]
    code = totp.hotp(totp.decode_secret(SECRET), totp.time_step(clock.now))

    statuses = run_in_parallel(
        8, lambda i: client.post("/auth/mfa/verify", json={"step_up_token": tokens[i], "code": code}).status_code
    )
    assert sorted(statuses) == [200] + [409] * 7


def test_intentos_en_paralelo_no_superan_el_limite_del_token(client, clock, settings):
    access = full_login(client)["access_token"]
    token = client.get("/api/boveda-critica", headers={"Authorization": f"Bearer {access}"}).json()["step_up_token"]
    wrong = "000000" if totp.hotp(totp.decode_secret(SECRET), totp.time_step(clock.now)) != "000000" else "111111"

    statuses = run_in_parallel(
        20, lambda _: client.post("/auth/mfa/verify", json={"step_up_token": token, "code": wrong}).status_code
    )
    assert statuses.count(400) == settings.mfa_max_attempts
    assert statuses.count(429) == 20 - settings.mfa_max_attempts


def test_rotar_el_mismo_refresh_token_en_paralelo_solo_funciona_una_vez(client):
    refresh = full_login(client)["refresh_token"]
    statuses = run_in_parallel(8, lambda _: client.post("/auth/refresh", json={"refresh_token": refresh}).status_code)
    assert statuses.count(200) == 1


def test_el_formulario_de_login_enviado_dos_veces_produce_un_solo_codigo(client):
    request_id = start_login(client, new_verifier())
    form = {"request_id": request_id, "username": "estudiante@unisabana.edu.co", "password": "Sabana2026!", "action": "login"}
    statuses = run_in_parallel(4, lambda _: client.post("/oauth/authorize", data=form).status_code)
    assert statuses.count(303) == 1
