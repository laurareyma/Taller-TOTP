/**
 * Une las piezas de la sesión: almacenamiento, cola de renovación y cliente HTTP.
 * Todo lo que necesite llamar a la API protegida debe usar `api` de este módulo.
 */

import { createApiClient } from './apiClient';
import { refreshSession, type TokenSet } from './authApi';
import { AuthError } from './errors';
import { networkLog } from './networkLog';
import { RefreshQueue } from './refreshQueue';
import { deleteRefreshToken, loadRefreshToken, memorySession, saveRefreshToken } from './tokenStorage';

const expiredListeners = new Set<() => void>();

/** AuthContext se suscribe para volver a la pantalla de bienvenida cuando la sesión muere. */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

export async function startSession(tokens: TokenSet): Promise<void> {
  await saveRefreshToken(tokens.refreshToken); // enclave seguro
  memorySession.set(tokens.accessToken, tokens.accessTokenExpiresAt); // memoria volátil
}

export async function clearLocalSession(): Promise<void> {
  memorySession.clear();
  await deleteRefreshToken().catch(() => {});
}

async function expireSession(): Promise<void> {
  await clearLocalSession();
  expiredListeners.forEach((listener) => listener());
}

/** La única función que llama a POST /auth/refresh. Siempre se ejecuta a través de la cola. */
async function doRefresh(): Promise<string> {
  const refreshToken = await loadRefreshToken();
  if (!refreshToken) {
    await expireSession();
    throw new AuthError('session_expired');
  }

  networkLog.add('POST /auth/refresh (una sola vez)', 'info');
  try {
    const tokens = await refreshSession(refreshToken);
    await startSession(tokens); // el backend rota el refresh token: se guarda el nuevo
    networkLog.add('POST /auth/refresh → 200 · access token nuevo, refresh rotado', 'ok');
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof AuthError && error.code === 'session_expired') {
      networkLog.add('POST /auth/refresh → 401 · sesión revocada: se borra SecureStore', 'error');
      await expireSession();
    } else {
      // Sin red: se conserva el refresh token para intentarlo después.
      networkLog.add(`POST /auth/refresh falló: ${error instanceof Error ? error.message : 'error'}`, 'warn');
    }
    throw error;
  }
}

export const refreshQueue = new RefreshQueue(doRefresh);

export const api = createApiClient({
  getAccessToken: () => memorySession.accessToken,
  queue: refreshQueue,
  log: networkLog.add,
});
