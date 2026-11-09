import base64

import pytest

from app.security import totp

RFC_SECRET = base64.b32encode(b"12345678901234567890").decode()


@pytest.mark.parametrize(
    ("counter", "code"),
    list(enumerate(["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"])),
)
def test_hotp_vectores_rfc4226(counter, code):
    assert totp.hotp(b"12345678901234567890", counter) == code


@pytest.mark.parametrize(
    ("seconds", "code"),
    [(59, "94287082"), (1111111109, "07081804"), (1111111111, "14050471"), (1234567890, "89005924"), (2000000000, "69279037"), (20000000000, "65353130")],
)
def test_totp_vectores_rfc6238(seconds, code):
    assert totp.hotp(totp.decode_secret(RFC_SECRET), totp.time_step(seconds), digits=8) == code


def test_decode_secret_tolera_formato():
    assert totp.decode_secret("jbsw y3dp-ehpk3pxp") == totp.decode_secret("JBSWY3DPEHPK3PXP")


def test_match_counter_acepta_c_menos_1_c_y_c_mas_1():
    secret, now = "JBSWY3DPEHPK3PXP", 1_700_000_000
    key, current = totp.decode_secret(secret), totp.time_step(now)
    for delta in (-1, 0, 1):
        assert totp.match_counter(secret, totp.hotp(key, current + delta), now) == current + delta
    for delta in (-2, 2):
        assert totp.match_counter(secret, totp.hotp(key, current + delta), now) is None
