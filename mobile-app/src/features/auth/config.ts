/**
 * Configuración del cliente OAuth.
 *
 * La app es un cliente PÚBLICO: no tiene client_secret (cualquiera podría extraerlo del APK).
 * Por eso usa PKCE.
 */

/**
 * URL del backend. Por defecto http://localhost:8000, que funciona en emulador y en teléfono por USB
 * después de `adb reverse tcp:8000 tcp:8000`. Se cambia con EXPO_PUBLIC_API_URL en mobile-app/.env.local.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export const CLIENT_ID = 'unisabana-mobile';

/** Debe coincidir con `scheme` en app.json y con REDIRECT_URIS del backend. */
export const REDIRECT_URI = 'unisabana-auth://oauth/callback';

export const REQUEST_TIMEOUT_MS = 10_000;
