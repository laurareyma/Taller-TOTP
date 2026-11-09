"""Almacenamiento en memoria: usuarios, solicitudes de login, códigos de autorización y refresh tokens.

Se pierde al reiniciar el servidor (suficiente para el laboratorio).

FastAPI atiende las rutas síncronas en varios hilos a la vez. Por eso toda operación que lee y luego
modifica el estado (marcar un código como usado, rotar un token, contar intentos) se hace bajo un candado:
sin él, dos peticiones simultáneas con el mismo código TOTP podrían pasar las dos el Anti-Replay.
"""

from __future__ import annotations

import math
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Literal

from app.security.passwords import hash_password, verify_password
from app.security.tokens import hash_token, new_opaque_token


@dataclass
class User:
    id: str
    username: str
    password_hash: str
    totp_secret: str


@dataclass
class LoginRequest:
    """Parámetros de /oauth/authorize guardados mientras el usuario llena el formulario."""

    id: str
    client_id: str
    redirect_uri: str
    state: str
    code_challenge: str
    expires_at: float


@dataclass
class AuthorizationCode:
    user_id: str
    client_id: str
    redirect_uri: str
    code_challenge: str
    expires_at: float
    used: bool = False
    family_id: str | None = None  # familia de refresh tokens emitida con este código


@dataclass
class RefreshToken:
    user_id: str
    family_id: str  # todos los tokens que salen de un mismo login comparten familia
    expires_at: float
    revoked: bool = False


MfaAttemptResult = Literal["ok", "token_limit", "user_limit"]


class GrantError(Exception):
    """Código o refresh token inválido, vencido, ya usado o revocado."""


@dataclass
class Store:
    clock: Callable[[], float] = time.time
    users: dict[str, User] = field(default_factory=dict)
    login_requests: dict[str, LoginRequest] = field(default_factory=dict)
    codes: dict[str, AuthorizationCode] = field(default_factory=dict)  # clave: hash del código
    refresh_tokens: dict[str, RefreshToken] = field(default_factory=dict)  # clave: hash del token
    used_otps: dict[tuple[str, int], float] = field(default_factory=dict)  # (usuario, ventana) → vence
    # Intentos 2FA por step_up_token: jti → [intentos, instante en que vence el token]
    mfa_token_attempts: dict[str, list[float]] = field(default_factory=dict)
    # Intentos 2FA por usuario (instantes), para no poder esquivar el límite pidiendo step_up_tokens nuevos
    mfa_user_attempts: dict[str, list[float]] = field(default_factory=dict)
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    # ---------- Anti-Replay de códigos TOTP ----------

    def _purge_used_otps(self) -> None:
        now = self.clock()
        for key in [k for k, expires_at in self.used_otps.items() if expires_at <= now]:
            del self.used_otps[key]

    def mark_otp_used(self, user_id: str, counter: int, ttl: int) -> bool:
        """Registra que el código de esa ventana ya se usó. Devuelve False si ya estaba (replay).

        Revisar y marcar ocurren bajo el mismo candado: solo una petición puede ganar.
        """
        with self._lock:
            self._purge_used_otps()
            key = (user_id, counter)
            if key in self.used_otps:
                return False
            self.used_otps[key] = self.clock() + ttl
            return True

    # ---------- Límite de intentos 2FA (fuerza bruta) ----------

    def _recent_user_attempts(self, user_id: str, window: int) -> list[float]:
        cutoff = self.clock() - window
        recent = [t for t in self.mfa_user_attempts.get(user_id, []) if t > cutoff]
        self.mfa_user_attempts[user_id] = recent
        return recent

    def reserve_mfa_attempt(
        self, user_id: str, jti: str, token_expires_at: float, *, max_per_token: int, max_per_user: int, window: int
    ) -> MfaAttemptResult:
        """Cuenta un intento ANTES de comparar el código, para que peticiones en paralelo no superen el límite.

        - max_per_token intentos por step_up_token.
        - max_per_user intentos por usuario en `window` segundos, aunque pida step_up_tokens nuevos.
        Un código correcto borra el contador del usuario (forget_mfa_attempts).
        """
        with self._lock:
            now = self.clock()
            for key in [k for k, (_, expires_at) in self.mfa_token_attempts.items() if expires_at <= now]:
                del self.mfa_token_attempts[key]

            token = self.mfa_token_attempts.setdefault(jti, [0, token_expires_at])
            if token[0] >= max_per_token:
                return "token_limit"
            recent = self._recent_user_attempts(user_id, window)
            if len(recent) >= max_per_user:
                return "user_limit"
            token[0] += 1
            recent.append(now)
            return "ok"

    def mfa_attempts_left(self, user_id: str, jti: str, *, max_per_token: int, max_per_user: int, window: int) -> int:
        with self._lock:
            used_by_token = int(self.mfa_token_attempts.get(jti, [0, 0])[0])
            used_by_user = len(self._recent_user_attempts(user_id, window))
            return max(0, min(max_per_token - used_by_token, max_per_user - used_by_user))

    def mfa_retry_after(self, user_id: str, window: int) -> int:
        """Segundos hasta que el intento más viejo del usuario salga de la ventana."""
        with self._lock:
            recent = self._recent_user_attempts(user_id, window)
            return max(1, math.ceil(recent[0] + window - self.clock())) if recent else 1

    def forget_mfa_attempts(self, user_id: str) -> None:
        with self._lock:
            self.mfa_user_attempts.pop(user_id, None)

    # ---------- Usuarios ----------

    def add_user(self, username: str, password: str, totp_secret: str) -> User:
        user = User(id=secrets.token_hex(8), username=username, password_hash=hash_password(password), totp_secret=totp_secret)
        self.users[user.id] = user
        return user

    def authenticate(self, username: str, password: str) -> User | None:
        user = next((u for u in self.users.values() if u.username.lower() == username.strip().lower()), None)
        if user and verify_password(password, user.password_hash):
            return user
        return None

    # ---------- Solicitudes de login ----------

    def create_login_request(self, *, client_id: str, redirect_uri: str, state: str, code_challenge: str, ttl: int) -> LoginRequest:
        request = LoginRequest(
            id=secrets.token_urlsafe(16),
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            code_challenge=code_challenge,
            expires_at=self.clock() + ttl,
        )
        self.login_requests[request.id] = request
        return request

    def get_login_request(self, request_id: str) -> LoginRequest | None:
        with self._lock:
            request = self.login_requests.get(request_id)
            if request and request.expires_at <= self.clock():
                del self.login_requests[request_id]
                return None
            return request

    def take_login_request(self, request_id: str) -> LoginRequest | None:
        """Saca la solicitud del almacén: un mismo formulario no puede producir dos códigos."""
        with self._lock:
            request = self.get_login_request(request_id)
            if request:
                del self.login_requests[request_id]
            return request

    def remove_login_request(self, request_id: str) -> None:
        self.login_requests.pop(request_id, None)

    # ---------- Códigos de autorización ----------

    def create_code(self, request: LoginRequest, user: User, ttl: int) -> str:
        code = new_opaque_token()
        self.codes[hash_token(code)] = AuthorizationCode(
            user_id=user.id,
            client_id=request.client_id,
            redirect_uri=request.redirect_uri,
            code_challenge=request.code_challenge,
            expires_at=self.clock() + ttl,
        )
        return code

    def consume_code(self, code: str) -> AuthorizationCode:
        """Marca el código como usado. Si alguien lo reutiliza, se revocan los tokens que ya emitió."""
        with self._lock:
            record = self.codes.get(hash_token(code))
            if record is None:
                raise GrantError("Código de autorización inválido.")
            if record.used:
                if record.family_id:
                    self.revoke_family(record.family_id)
                raise GrantError("El código de autorización ya fue usado.")
            record.used = True
            if record.expires_at <= self.clock():
                raise GrantError("El código de autorización venció.")
            return record

    # ---------- Refresh tokens ----------

    def issue_refresh_token(self, user_id: str, ttl: int, family_id: str | None = None) -> tuple[str, str]:
        """Devuelve (token, family_id)."""
        token = new_opaque_token()
        family = family_id or secrets.token_hex(8)
        with self._lock:
            self.refresh_tokens[hash_token(token)] = RefreshToken(user_id=user_id, family_id=family, expires_at=self.clock() + ttl)
        return token, family

    def rotate_refresh_token(self, token: str, ttl: int) -> tuple[str, str]:
        """Rotación: el token usado se revoca y se entrega uno nuevo de la misma familia.

        Si llega un token ya revocado, alguien lo copió: se revoca toda la familia (RFC 9700 §4.14).
        Devuelve (user_id, token_nuevo).
        """
        with self._lock:
            record = self.refresh_tokens.get(hash_token(token))
            if record is None:
                raise GrantError("Refresh token inválido.")
            if record.revoked:
                self.revoke_family(record.family_id)
                raise GrantError("Refresh token reutilizado: la sesión fue revocada.")
            if record.expires_at <= self.clock():
                raise GrantError("El refresh token venció.")

            record.revoked = True
            new_token, _ = self.issue_refresh_token(record.user_id, ttl, family_id=record.family_id)
            return record.user_id, new_token

    def revoke_refresh_token(self, token: str) -> None:
        with self._lock:
            record = self.refresh_tokens.get(hash_token(token))
            if record:
                self.revoke_family(record.family_id)

    def revoke_family(self, family_id: str) -> None:
        with self._lock:
            for record in self.refresh_tokens.values():
                if record.family_id == family_id:
                    record.revoked = True
