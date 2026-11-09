/**
 * Separación de memoria (Punto 2 del taller):
 *  - refresh_token (30 días) → enclave seguro: iOS Keychain / Android Keystore (expo-secure-store).
 *  - access_token (5 min)    → solo en memoria (variable de este módulo); muere con el proceso.
 */

import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'refresh_token';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY, OPTIONS);
}

export function saveRefreshToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, OPTIONS);
}

export function deleteRefreshToken(): Promise<void> {
  return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, OPTIONS);
}

// ---------- access token en memoria volátil ----------

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
// elevated_token (mfa_verified=true, 10 min): también solo en memoria.
let elevatedToken: string | null = null;
let elevatedExpiresAt = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const memorySession = {
  get accessToken() {
    return accessToken;
  },
  get expiresAt() {
    return accessTokenExpiresAt;
  },
  get elevatedToken() {
    return elevatedToken && elevatedExpiresAt > Date.now() ? elevatedToken : null;
  },
  get elevatedExpiresAt() {
    return elevatedExpiresAt;
  },
  set(token: string, expiresAt: number) {
    accessToken = token;
    accessTokenExpiresAt = expiresAt;
    notify();
  },
  setElevated(token: string, expiresAt: number) {
    elevatedToken = token;
    elevatedExpiresAt = expiresAt;
    notify();
  },
  clearElevated() {
    elevatedToken = null;
    elevatedExpiresAt = 0;
    notify();
  },
  /** Cierre de sesión: se borran el access token y el elevado. */
  clear() {
    accessToken = null;
    accessTokenExpiresAt = 0;
    elevatedToken = null;
    elevatedExpiresAt = 0;
    notify();
  },
  /** Para useSyncExternalStore: la UI se entera cuando el token se renueva. */
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
