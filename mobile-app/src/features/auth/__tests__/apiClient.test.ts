import { createApiClient } from '../apiClient';
import { AuthError } from '../errors';
import { RefreshQueue } from '../refreshQueue';

/**
 * Servidor falso: acepta solo el token "vigente". Cada respuesta tarda un poco,
 * para que las peticiones realmente se crucen en el tiempo.
 */
function setup({ refreshFails = false } = {}) {
  const server = { validToken: 'nuevo' };
  const sentTokens: string[] = [];

  global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
    const token = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '') ?? '';
    sentTokens.push(token);
    await new Promise((r) => setTimeout(r, 5));
    const ok = token === server.validToken;
    return { ok, status: ok ? 200 : 401, json: async () => (ok ? { username: 'ana' } : { error: 'invalid_token' }) };
  }) as unknown as typeof fetch;

  let accessToken: string | null = 'viejo';
  const doRefresh = jest.fn(async () => {
    await new Promise((r) => setTimeout(r, 20));
    if (refreshFails) {
      accessToken = null;
      throw new AuthError('session_expired');
    }
    accessToken = server.validToken;
    return accessToken;
  });
  const queue = new RefreshQueue(doRefresh);
  const api = createApiClient({ getAccessToken: () => accessToken, queue });

  return { api, doRefresh, sentTokens, setToken: (t: string | null) => (accessToken = t) };
}

describe('apiClient — Silent Refresh Queue', () => {
  it('3 peticiones simultáneas con token vencido → 1 solo refresh y las 3 se reintentan', async () => {
    const { api, doRefresh, sentTokens } = setup();

    const results = await Promise.all([api.getJson('/api/me'), api.getJson('/api/me'), api.getJson('/api/me')]);

    expect(results).toEqual([{ username: 'ana' }, { username: 'ana' }, { username: 'ana' }]);
    expect(doRefresh).toHaveBeenCalledTimes(1);
    expect(sentTokens.filter((t) => t === 'viejo')).toHaveLength(3);
    expect(sentTokens.filter((t) => t === 'nuevo')).toHaveLength(3);
  });

  it('una petición que llega durante la renovación espera en la cola y no usa el token viejo', async () => {
    const { api, doRefresh, sentTokens } = setup();

    const first = api.getJson('/api/me');
    await new Promise((r) => setTimeout(r, 10)); // ya llegó el 401 y empezó el refresh
    const late = api.getJson('/api/me');

    await Promise.all([first, late]);
    expect(doRefresh).toHaveBeenCalledTimes(1);
    expect(sentTokens).toEqual(['viejo', 'nuevo', 'nuevo']); // la tardía nunca envió "viejo"
  });

  it('con token válido no renueva', async () => {
    const { api, doRefresh, setToken } = setup();
    setToken('nuevo');
    await api.getJson('/api/me');
    expect(doRefresh).not.toHaveBeenCalled();
  });

  it('sin token en memoria renueva antes de enviar', async () => {
    const { api, doRefresh, setToken, sentTokens } = setup();
    setToken(null);
    await api.getJson('/api/me');
    expect(doRefresh).toHaveBeenCalledTimes(1);
    expect(sentTokens).toEqual(['nuevo']);
  });

  it('si el refresh falla, todas las peticiones fallan con session_expired', async () => {
    const { api, doRefresh } = setup({ refreshFails: true });
    const results = await Promise.allSettled([api.getJson('/api/me'), api.getJson('/api/me')]);

    expect(doRefresh).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r.status).toBe('rejected');
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'session_expired' });
    }
  });

  it('reintenta una sola vez: un segundo 401 no provoca un bucle', async () => {
    const { api, doRefresh } = setup();
    // El servidor sigue rechazando incluso el token renovado.
    (global.fetch as jest.Mock).mockImplementation(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(api.getJson('/api/me')).rejects.toMatchObject({ code: 'session_expired' });
    expect(doRefresh).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('respuestas que no son 401 pasan sin tocar la sesión', async () => {
    const { api, doRefresh, setToken } = setup();
    setToken('nuevo');
    (global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'mfa_required', error_description: 'Se requiere 2FA' }),
    }));
    await expect(api.getJson('/api/boveda-critica')).rejects.toMatchObject({ status: 403 });
    expect(doRefresh).not.toHaveBeenCalled();
  });
});
