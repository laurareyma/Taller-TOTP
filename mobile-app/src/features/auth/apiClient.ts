/**
 * Cliente HTTP con interceptor de 401 (Punto 2 del taller).
 *
 *  1. Si hay una renovación en curso, la petición espera en la cola antes de salir.
 *  2. Envía la petición con `Authorization: Bearer <access_token>`.
 *  3. Si responde 401: renueva el token a través de la cola (una sola renovación para todas)
 *     y reintenta la petición original UNA vez.
 *  4. Si la renovación falla porque la sesión expiró, el error llega a todas las peticiones encoladas
 *     y session.ts cierra la sesión.
 */

import { request } from './authApi';
import { AuthError } from './errors';
import type { RefreshQueue } from './refreshQueue';

export type LogKind = 'info' | 'ok' | 'warn' | 'error';

export interface ApiClientDeps {
  getAccessToken: () => string | null;
  queue: Pick<RefreshQueue, 'refresh' | 'isRefreshing'>;
  log?: (text: string, kind: LogKind) => void;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.error_description === 'string' ? body.error_description : `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

export function createApiClient({ getAccessToken, queue, log = () => {} }: ApiClientDeps) {
  function send(path: string, init: RequestInit, token: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    return request(path, { ...init, headers });
  }

  async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const label = `${init.method ?? 'GET'} ${path}`;

    let token: string;
    if (queue.isRefreshing) {
      log(`${label}: en cola, esperando la renovación`, 'info');
      token = await queue.refresh();
    } else {
      // Sin access token en memoria (p. ej. la app se abrió sin red): se renueva antes de enviar.
      token = getAccessToken() ?? (await queue.refresh());
    }

    const first = await send(path, init, token);
    log(`${label} → ${first.status}`, first.status === 401 ? 'warn' : first.ok ? 'ok' : 'info');
    if (first.status !== 401) return first;

    // Si otra petición ya renovó el token mientras esta viajaba, se usa ese y no se renueva otra vez.
    const current = getAccessToken();
    const fresh = current && current !== token ? current : await queue.refresh();

    const retry = await send(path, init, fresh);
    log(`${label} (reintento) → ${retry.status}`, retry.ok ? 'ok' : 'warn');
    return retry; // un segundo 401 no se reintenta: evita bucles
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await apiFetch(path);
    if (response.status === 401) throw new AuthError('session_expired');
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new ApiError(response.status, body);
    return body as T;
  }

  return { fetch: apiFetch, getJson };
}

export type ApiClient = ReturnType<typeof createApiClient>;
