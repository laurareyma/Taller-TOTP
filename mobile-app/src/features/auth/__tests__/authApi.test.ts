import { exchangeCode, parseTokenResponse, refreshSession } from '../authApi';
import { AuthError } from '../errors';

const TOKENS = { access_token: 'at', refresh_token: 'rt', token_type: 'Bearer', expires_in: 300 };

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('parseTokenResponse', () => {
  it('calcula el vencimiento del access token', () => {
    expect(parseTokenResponse(TOKENS, 1_000)).toEqual({ accessToken: 'at', refreshToken: 'rt', accessTokenExpiresAt: 301_000 });
  });

  it.each([null, {}, { ...TOKENS, expires_in: '300' }, { ...TOKENS, token_type: 'mac' }])('rechaza %j', (body) => {
    expect(() => parseTokenResponse(body)).toThrow(AuthError);
  });
});

describe('exchangeCode', () => {
  it('envía code y code_verifier como form-urlencoded', async () => {
    const fetchMock = mockFetch(200, TOKENS);
    await exchangeCode('el code', 'verifier');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/auth/oauth/token');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toBe(
      'grant_type=authorization_code&code=el%20code&redirect_uri=unisabana-auth%3A%2F%2Foauth%2Fcallback' +
        '&client_id=unisabana-mobile&code_verifier=verifier',
    );
    expect(init.body).not.toMatch(/client_secret/);
  });

  it('muestra el motivo del servidor si falla PKCE', async () => {
    mockFetch(400, { error: 'invalid_grant', error_description: 'Verificación PKCE fallida' });
    await expect(exchangeCode('c', 'v')).rejects.toThrow(/PKCE/);
  });

  it('convierte un fallo de red en AuthError network', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    await expect(exchangeCode('c', 'v')).rejects.toMatchObject({ code: 'network' });
  });
});

describe('refreshSession', () => {
  it('401 significa sesión expirada', async () => {
    mockFetch(401, { error: 'invalid_grant' });
    await expect(refreshSession('rt')).rejects.toMatchObject({ code: 'session_expired' });
  });

  it('devuelve los tokens rotados', async () => {
    mockFetch(200, { ...TOKENS, refresh_token: 'rt-nuevo' });
    await expect(refreshSession('rt')).resolves.toMatchObject({ refreshToken: 'rt-nuevo' });
  });
});
