/** Construcción de la URL de autorización y validación del deep link de regreso. */

import { AuthError } from './errors';

export interface AuthorizeParams {
  apiUrl: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}

export function encodeForm(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export function buildAuthorizeUrl(p: AuthorizeParams): string {
  return `${p.apiUrl}/oauth/authorize?${encodeForm({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
  })}`;
}

function parseQuery(url: string): Record<string, string> {
  const start = url.indexOf('?');
  if (start === -1) return {};
  const end = url.indexOf('#', start);
  const query = url.slice(start + 1, end === -1 ? undefined : end);
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));
    try {
      params[decode(eq === -1 ? pair : pair.slice(0, eq))] = eq === -1 ? '' : decode(pair.slice(eq + 1));
    } catch {
      throw new AuthError('invalid_callback', 'parámetros mal codificados');
    }
  }
  return params;
}

/**
 * Valida el deep link `unisabana-auth://oauth/callback?code=...&state=...` y devuelve el code.
 * El state se compara PRIMERO: si no coincide, no se mira nada más y se aborta (anti-CSRF).
 */
export function parseCallbackUrl(url: string, redirectUri: string, expectedState: string): string {
  if (!url.startsWith(redirectUri)) throw new AuthError('invalid_callback', 'redirect inesperado');

  const params = parseQuery(url);
  if (!params.state || params.state !== expectedState) throw new AuthError('state_mismatch');

  if (params.error) {
    if (params.error === 'access_denied') throw new AuthError('cancelled');
    throw new AuthError('authorization_denied', params.error_description || params.error);
  }
  if (!params.code) throw new AuthError('invalid_callback', 'falta code');
  return params.code;
}
