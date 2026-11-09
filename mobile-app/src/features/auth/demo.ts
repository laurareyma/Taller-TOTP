/**
 * Herramientas SOLO para la sustentación: provocan los casos del Silent Refresh sin esperar 5 minutos.
 */

import { revokeSession } from './authApi';
import { networkLog } from './networkLog';
import { loadRefreshToken, memorySession } from './tokenStorage';

/** Reemplaza el access token en memoria por uno inválido: la siguiente petición recibirá 401. */
export function invalidateAccessToken(): void {
  if (!memorySession.accessToken) return;
  memorySession.set('token-invalidado-para-la-demo', Date.now());
  networkLog.add('Demo: access token invalidado en memoria', 'info');
}

/**
 * Revoca la sesión en el servidor pero deja el refresh token en el teléfono, como si lo hubieran robado
 * y revocado. Junto con invalidateAccessToken(), la siguiente petición termina en cierre de sesión automático.
 */
export async function revokeOnServer(): Promise<void> {
  const refreshToken = await loadRefreshToken();
  if (!refreshToken) return;
  await revokeSession(refreshToken);
  networkLog.add('Demo: sesión revocada en el servidor', 'info');
}
