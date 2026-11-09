from app.security import pkce

# Vector de ejemplo del RFC 7636, Apéndice B
RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_s256_reproduce_el_rfc():
    assert pkce.s256_challenge(RFC_VERIFIER) == RFC_CHALLENGE


def test_verify_acepta_el_par_correcto():
    assert pkce.verify(RFC_VERIFIER, RFC_CHALLENGE)


def test_verify_rechaza_otro_verifier():
    assert not pkce.verify(RFC_VERIFIER[:-1] + "Y", RFC_CHALLENGE)


def test_verify_rechaza_longitudes_y_caracteres_invalidos():
    assert not pkce.verify("a" * 42, pkce.s256_challenge("a" * 42))  # muy corto
    assert not pkce.verify("a" * 129, pkce.s256_challenge("a" * 129))  # muy largo
    bad = "a" * 42 + "+"
    assert not pkce.verify(bad, pkce.s256_challenge(bad))  # '+' no es URL-safe


def test_is_valid_challenge():
    assert pkce.is_valid_challenge(RFC_CHALLENGE)
    assert not pkce.is_valid_challenge(RFC_CHALLENGE + "=")
    assert not pkce.is_valid_challenge("corto")
