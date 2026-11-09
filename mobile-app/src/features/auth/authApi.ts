/** Llamadas HTTP al backend de autenticación. */

import { API_URL, CLIENT_ID, REDIRECT_URI, REQUEST_TIMEOUT_MS } from './config';
import { AuthError } from './errors';
import { encodeForm } from './oauthUrls';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Instante (ms Unix) en que vence el access token. */
  accessTokenExpiresAt: number;
}

export interface Me {
  id: string;
  username: string;
  mfa_verified: boolean;
}

/** fetch con tiempo límite; los fallos de red se convierten en AuthError('network'). */
export async function request(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new AuthError('network');
  } finally {
    clearTimeout(timer);
  }
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error_description?: string; error?: string };
    return body.error_description || body.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export function parseTokenResponse(body: unknown, now = Date.now()): TokenSet {
  const b = body as Record<string, unknown> | null;
  if (
    !b ||
    typeof b.access_token !== 'string' ||
    typeof b.refresh_token !== 'string' ||
    typeof b.expires_in !== 'number' ||
    (typeof b.token_type === 'string' && b.token_type.toLowerCase() !== 'bearer')
  ) {
    throw new AuthError('server', 'respuesta de tokens inválida');
  }
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    accessTokenExpiresAt: now + b.expires_in * 1000,
  };
}

/** Canjea el authorization code + code_verifier por los tokens (form-urlencoded, RFC 6749 §4.1.3). */
export async function exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const response = await request('/auth/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: encodeForm({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });
  if (!response.ok) throw new AuthError('authorization_denied', await errorDetail(response));
  return parseTokenResponse(await response.json());
}

/** Pide un access token nuevo. El backend rota el refresh token: hay que guardar el que devuelve. */
export async function refreshSession(refreshToken: string): Promise<TokenSet> {
  const response = await request('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (response.status === 400 || response.status === 401) throw new AuthError('session_expired');
  if (!response.ok) throw new AuthError('server', await errorDetail(response));
  return parseTokenResponse(await response.json());
}

/** Revoca la sesión en el servidor. Si falla (sin red), se ignora: localmente ya se borró todo. */
export async function revokeSession(refreshToken: string): Promise<void> {
  try {
    await request('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    // sin conexión: el refresh token vencerá solo
  }
}
