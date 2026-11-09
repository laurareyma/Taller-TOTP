# Taller Seguridad Móvil — OAuth 2.0 + PKCE y Step-Up 2FA (TOTP)

Universidad de La Sabana · Desarrollo Móvil · Sesión 14

```
/mobile-app     App en Expo (React Native + TypeScript)
/backend-auth   Servidor de autorización y API (FastAPI)
```

## Atajos desde la raíz

Desde la carpeta `Taller-TOTP` se puede correr todo sin entrar a cada subcarpeta:

| Comando | Qué hace |
| --- | --- |
| `npm run backend` | Levanta el backend en el puerto 8000 |
| `npm run backend:setup` | Crea `backend-auth/.venv` con Python 3.12 e instala dependencias (requiere `uv`) |
| `npm run adb:reverse` | Hace que `localhost:8000` del teléfono/emulador apunte al computador |
| `npm run android` | Compila e instala el development build en Android |
| `npm start` | Servidor de Expo (Metro) |
| `npm test` | Pruebas de la app y del backend |
| `npm run qr -- --random` | QR de prueba con una semilla nueva |
| `npm run totp -- SEMILLA --watch` | Código TOTP actual en la terminal |

La primera vez hay que instalar las dependencias de la app: `cd mobile-app && npm install`.

## Decisiones de nombres

La guía del taller usa nombres distintos para lo mismo; en este proyecto se usan estos:

| Concepto | Valor |
| --- | --- |
| Esquema de deep link | `unisabana-auth://` |
| Redirect URI | `unisabana-auth://oauth/callback` |
| Recurso protegido | `GET /api/boveda-critica` (con alias `GET /api/boveda`) |
| Intercambio de código | `POST /auth/oauth/token` |
| Renovación | `POST /auth/refresh` |
| Verificación 2FA | `POST /auth/mfa/verify` |

## Estado por etapas

- [x] **0. Estructura del repo**
- [x] **1. Núcleo TOTP** (`mobile-app/src/security/totp`) — RFC 4226/6238 desde cero, probado con los vectores oficiales
- [x] **2. Pantalla Authenticator** — semilla manual o QR, barra de 30 s, semilla en SecureStore, 100 % offline
- [x] **3. Backend OAuth + PKCE** — login en el navegador, canje con PKCE, rotación de refresh tokens
- [x] **4. Login PKCE en la app** — navegador del sistema, `state` anti-CSRF, refresh token en SecureStore
- [x] **5. Silent Refresh Queue** — un solo `/auth/refresh` para N peticiones con 401; cierre de sesión automático
- [x] **6. Step-Up + Anti-Replay** — 403 `mfa_required` → modal 2FA → `elevated_token`; reuso del código → 409
- [x] **7. Pulido y auditoría de la sustentación**

## App móvil

Requisitos: Node 20+.

```bash
cd mobile-app
npm install
npm start              # abre Expo; escanea el QR de la terminal con Expo Go
npm test               # pruebas (vectores RFC 4226 / 6238 / 2202 / 4648 y validación de la cuenta)
npm run typecheck
npm run totp           # código actual de la semilla de ejemplo JBSWY3DPEHPK3PXP
npm run totp -- TU_SEMILLA --watch   # se actualiza cada segundo
npm run qr             # QR otpauth:// de la semilla de ejemplo en la terminal
npm run qr -- --random # QR con una semilla nueva de 160 bits
```

**Prueba de paridad (aceptación #2):** ejecuta `npm run qr -- --random` y escanea el mismo QR con
la app (Authenticator → Escanear código QR) y con Google Authenticator. Los dos deben mostrar el
mismo código al mismo tiempo.

**Prueba offline (aceptación #3):** con la cuenta ya agregada, activa el Modo Avión y espera a que
la barra llegue a 0: el código se renueva sin red.

### Correr en Android (development build)

El Authenticator funciona en Expo Go, pero el login necesita el esquema `unisabana-auth://`, que
Expo Go no tiene. Por eso se usa un *development build*.

**Una sola vez:**

1. Instala [Android Studio](https://developer.android.com/studio) y, en su asistente inicial, deja
   marcados *Android SDK*, *Platform-Tools* y *Android Virtual Device*.
2. Agrega a `~/.zshrc` y abre una terminal nueva:
   ```bash
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
   ```
3. Crea un emulador en *Device Manager*, o conecta tu teléfono por USB con la *Depuración USB* activada.

**Cada vez:**

```bash
# Terminal 1: backend
cd backend-auth && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: app
adb reverse tcp:8000 tcp:8000   # "localhost:8000" del teléfono = el computador
cd mobile-app
npx expo run:android            # la primera compilación tarda varios minutos
```

`adb reverse` sirve igual para el emulador y para el teléfono por USB. Si el teléfono va por
Wi-Fi, crea `mobile-app/.env.local` con `EXPO_PUBLIC_API_URL=http://<IP-del-computador>:8000`.

> `usesCleartextTraffic` está activado (en `app.json`) solo porque el backend de desarrollo usa
> `http://`. En producción el backend iría por HTTPS y esa opción se quitaría.

### Login OAuth + PKCE (`src/features/auth/`)

| Archivo | Qué hace |
| --- | --- |
| `pkce.ts` | `code_verifier` (32 bytes → 43 caracteres), `code_challenge` S256 y `state`; probado con el vector del RFC 7636 |
| `cryptoExpo.ts` | Azar criptográfico y SHA-256 nativos (`expo-crypto`) |
| `oauthUrls.ts` | Arma la URL de `/oauth/authorize` y valida el deep link: **si el `state` no coincide, aborta** |
| `signIn.ts` | Abre `WebBrowser.openAuthSessionAsync` (Chrome Custom Tabs), nunca un WebView |
| `authApi.ts` | Canje del código, refresh, logout y `/api/me` |
| `tokenStorage.ts` | `refresh_token` en SecureStore; `access_token` solo en memoria |
| `AuthContext.tsx` | Estado de la sesión; al abrir la app la restaura con el refresh token |
| `src/app/oauth/callback.tsx` | Absorbe el deep link en Expo Router; no procesa el `code` |

La app no tiene `client_secret`: es un cliente público y se protege con PKCE.

### Silent Refresh Queue (`src/features/auth/`)

| Archivo | Qué hace |
| --- | --- |
| `refreshQueue.ts` | Cola de promesas: la primera petición con 401 dispara **un** refresh; las demás esperan y reciben el mismo token |
| `apiClient.ts` | Envoltorio de `fetch`: agrega el Bearer, espera si hay una renovación en curso, ante 401 renueva y reintenta **una** vez |
| `session.ts` | Une todo: `doRefresh()` guarda el refresh rotado en SecureStore; si el servidor lo rechaza, borra todo y avisa a la UI |
| `networkLog.ts` | Registro en pantalla de las peticiones, para la demo |
| `demo.ts` | Botones de demostración: invalidar el token en memoria y revocar la sesión en el servidor |

¿Por qué la cola es obligatoria aquí? El backend **rota** el refresh token y, si recibe uno ya
usado, revoca la sesión completa. Dos refresh en paralelo harían que la app se cerrara la sesión
a sí misma.

**Demo en vivo** (pantalla de inicio, sección *Silent Refresh*):

1. *Invalidar token* y luego *3 peticiones simultáneas* → el registro muestra 3 × 401, **un**
   `POST /auth/refresh` y 3 reintentos con 200. En la terminal del backend aparece un solo `/auth/refresh`.
2. *Revocar en servidor*, luego *Invalidar token* y *3 peticiones simultáneas* → el refresh
   responde 401, se borra SecureStore y la app vuelve sola a la pantalla de bienvenida.

Para mostrar que el token vence de verdad sin los botones, arranca el backend con un TTL corto:
`ACCESS_TOKEN_TTL=20 npm run backend`.

### Bóveda crítica con Step-Up (`src/features/vault/`, `src/app/vault.tsx`)

1. La app pide `GET /api/boveda-critica` con el access token normal → **403 `mfa_required`** + `step_up_token`.
2. Se abre el modal 2FA: teclado numérico, 6 dígitos, se envía solo al completar. Si la cuenta TOTP
   está en la app, se puede ver el código sin salir del modal.
3. `POST /auth/mfa/verify` → `elevated_token` (`mfa_verified: true`, 10 min), guardado **solo en memoria**.
4. La app reintenta la bóveda con el `elevated_token` y muestra los datos.

`verifyMfa` no pasa por el interceptor de 401: un código incorrecto no es una sesión vencida.

**Prueba #5 (replay):** con la bóveda abierta, *Probar replay* pide un `step_up_token` nuevo y
reenvía el mismo código → **409 Replay Attack Detected**.

### Módulo TOTP

| Archivo | Qué hace |
| --- | --- |
| `base32.ts` | Decodifica y valida la semilla Base32 |
| `hmacSha1.ts` | HMAC-SHA1 (RFC 2104) armado sobre el SHA-1 de `expo-crypto`, que no trae HMAC |
| `totp.ts` | Contador de 8 bytes Big-Endian, truncamiento dinámico, HOTP y TOTP |
| `otpauth.ts` | Lee el URI `otpauth://totp/...` del código QR |
| `sha1Expo.ts` | Adaptador al SHA-1 nativo del dispositivo |
| `index.ts` | `getTotpCode(semilla)` para usar en las pantallas |

### Pantalla Authenticator

| Archivo | Qué hace |
| --- | --- |
| `src/app/authenticator/index.tsx` | Muestra el código, la barra y el emisor; o las opciones para agregar cuenta |
| `src/app/authenticator/scan.tsx` | Escaneo del QR con `expo-camera` |
| `src/app/authenticator/manual.tsx` | Semilla Base32 (o URI `otpauth://`) a mano, con validación — para emuladores |
| `src/features/authenticator/accountStorage.ts` | Guarda la cuenta en SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) |
| `src/features/authenticator/useTotp.ts` | Recalcula el código solo al cambiar la ventana; sin parpadeo |
| `src/features/authenticator/components/` | `TotpCode` (monoespaciado, dígitos de ancho fijo) y `CountdownBar` (animación nativa) |

No se usa ninguna librería de TOTP: solo el hash SHA-1 nativo (`expo-crypto`).

## Backend

Requisitos: Python 3.10+. La forma más simple es con [uv](https://docs.astral.sh/uv/), que descarga
Python 3.12 solo para este proyecto:

```bash
cd backend-auth
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
cp .env.example .env          # y cambia JWT_SECRET
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pytest
```

(Sin uv: `python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`.)

`--host 0.0.0.0` es necesario para que el teléfono llegue al backend usando la IP del computador
en la red local (en el emulador de Android la dirección es `10.0.2.2`). La documentación
interactiva queda en `http://localhost:8000/docs`.

**Usuario de demostración:** `estudiante@unisabana.edu.co` / `Sabana2026!` (configurable en `.env`).

### Endpoints

| Método y ruta | Qué hace |
| --- | --- |
| `GET /oauth/authorize` | Valida `client_id`, `redirect_uri`, `state` y `code_challenge` (S256) y muestra el login |
| `POST /oauth/authorize` | Verifica la contraseña y redirige (303) a `unisabana-auth://oauth/callback?code=…&state=…` |
| `POST /auth/oauth/token` | Form-urlencoded: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`. Comprueba `SHA256(code_verifier) == code_challenge` |
| `POST /auth/refresh` | JSON `{refresh_token}`. Rota el token; si recibe uno ya usado, revoca toda la sesión |
| `POST /auth/logout` | JSON `{refresh_token}`. Revoca la sesión |
| `GET /api/me` | Requiere `Authorization: Bearer <access_token>`; responde 401 si falta o venció |
| `GET /api/boveda-critica` | Con token normal: **403** `mfa_required` + `step_up_token` (120 s). Con `elevated_token`: los datos |
| `POST /auth/mfa/verify` | JSON `{step_up_token, code}` → `elevated_token`. Errores: 400 código incorrecto, 409 replay, 429 demasiados intentos, 401 step_up vencido |

### Decisiones de seguridad

- **Cliente público sin `client_secret`**: la app se identifica solo con `client_id`; PKCE reemplaza al secreto.
- **`redirect_uri` en lista blanca**: si no coincide, el servidor muestra un error y *no* redirige.
- **Código de autorización** de un solo uso, 60 s de vida. Si se reutiliza, se revocan los tokens que ya emitió.
- **Refresh tokens opacos con rotación**: en memoria solo se guarda su hash SHA-256. Reusar uno viejo revoca la familia completa (detección de robo).
- **Access token JWT HS256** de 5 min con `mfa_verified: false`; el algoritmo está fijo para evitar `alg: none`.
- **Contraseñas con scrypt**; la página de login envía `X-Frame-Options: DENY` y `Cache-Control: no-store`.
- **TOTP propio en Python** (`app/security/totp.py`, solo `hmac` de la biblioteca estándar), probado con los vectores del RFC 6238.
- **Clock skew:** se aceptan las ventanas C-1, C y C+1 (±30 s).
- **Anti-Replay:** se recuerda la ventana usada por cada usuario durante 90 s (RFC 6238 §5.2). El mismo código → **409**, incluso con otro `step_up_token`.
- **Fuerza bruta:** 5 intentos por `step_up_token` y 10 por usuario cada 15 min (pedir `step_up_token` nuevos no reinicia la cuenta). Después, **429** con `Retry-After`. Un código correcto reinicia el contador.
- **Peticiones simultáneas:** las operaciones de un solo uso (marcar un código TOTP, canjear el código OAuth, rotar el refresh token, contar intentos) se hacen bajo un candado. Dos envíos a la vez del mismo código → uno 200 y el otro 409 (`tests/test_concurrency.py`).
- **Formato del código:** se valida con `[0-9]{6}`; `\d` de Python también aceptaría dígitos de otros alfabetos.
- **Step-Up con 403, no 401:** la sesión sigue viva, solo falta el segundo factor (cabecera `insufficient_user_authentication`, RFC 9470).

| Archivo | Qué hace |
| --- | --- |
| `app/config.py` | Variables de entorno y valores por defecto |
| `app/security/pkce.py` | Cálculo y verificación S256 (probado con el vector del RFC 7636) |
| `app/security/tokens.py` | Creación y validación de JWT; hash de tokens opacos |
| `app/security/passwords.py` | Hash de contraseñas con scrypt |
| `app/security/totp.py` | HOTP/TOTP y búsqueda en ventanas C-1, C, C+1 |
| `app/routers/mfa.py` | `POST /auth/mfa/verify`: intentos, ventanas y Anti-Replay |
| `app/store.py` | Usuarios, solicitudes de login, códigos, refresh tokens, Anti-Replay e intentos 2FA en memoria (con candado entre hilos) |
| `app/routers/` | `oauth.py` (authorize), `auth.py` (token/refresh/logout), `api.py` (recursos) |
| `app/pages.py` | HTML del login y de errores |

## Guía rápida de sustentación (5 minutos)

| # | Escenario de aceptación | Acción en vivo | Qué explicar al evaluador |
|---|---|---|---|
| **1** | **OAuth 2.0 + PKCE** | Clic en *Iniciar sesión*. Se abre el navegador nativo (Custom Tabs), se autentica con `estudiante@unisabana.edu.co` / `Sabana2026!` y regresa a la app. | Cliente público sin `client_secret`. Se generó `code_verifier` y `code_challenge` (SHA-256). Se validó el parámetro `state` anti-CSRF. El `access_token` reside solo en memoria volátil y el `refresh_token` se persiste en `SecureStore`. |
| **2** | **Paridad TOTP** | Correr `npm run qr` (o `npm run qr -- --random`). Escanear el QR tanto en la app como en Google Authenticator. | Ambos muestran exactamente el mismo código de 6 dígitos. Implementado desde cero (RFC 6238/4226: HMAC-SHA1 + Truncamiento Dinámico) sin librerías de alto nivel como `otplib`. |
| **3** | **Modo Avión** | Activar Modo Avión en el teléfono. Esperar a que el contador de 30 s llegue a 0. | El código se recalcula matemáticamente en el dispositivo usando el reloj interno sin ninguna petición de red. |
| **4** | **Step-Up Bóveda** | Clic en *Bóveda crítica*. | La app atrapa el `403 Forbidden` (`mfa_required` + `step_up_token`), abre el modal 2FA, verifica el TOTP con `POST /auth/mfa/verify`, obtiene un `elevated_token` (10 min) y desbloquea los datos sensibles. |
| **5** | **Anti-Replay & Silent Refresh** | Con la bóveda abierta, presionar *Probar replay*. Luego ir al inicio y presionar *3 peticiones simultáneas*. | **Replay:** El servidor responde `409 Conflict: Replay Attack Detected` al detectar reuso en la misma ventana de tiempo (caché TTL 90s).<br>**Silent Refresh:** Se observan 3 peticiones concurrentes con 401 encoladas, un único `POST /auth/refresh` con rotación, y 3 reintentos exitosos (200). |

