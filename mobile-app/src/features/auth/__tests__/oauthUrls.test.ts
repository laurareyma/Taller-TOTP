import { AuthError } from '../errors';
import { buildAuthorizeUrl, parseCallbackUrl } from '../oauthUrls';

const REDIRECT = 'unisabana-auth://oauth/callback';
const STATE = 'estado-123';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof AuthError ? e.code : 'otro';
  }
  return undefined;
}

describe('buildAuthorizeUrl', () => {
  it('incluye todos los parámetros codificados', () => {
    const url = buildAuthorizeUrl({
      apiUrl: 'http://localhost:8000',
      clientId: 'unisabana-mobile',
      redirectUri: REDIRECT,
      codeChallenge: 'abc-_',
      state: STATE,
    });
    expect(url).toBe(
      'http://localhost:8000/oauth/authorize?response_type=code&client_id=unisabana-mobile' +
        '&redirect_uri=unisabana-auth%3A%2F%2Foauth%2Fcallback&state=estado-123' +
        '&code_challenge=abc-_&code_challenge_method=S256',
    );
  });
});

describe('parseCallbackUrl', () => {
  it('devuelve el code cuando el state coincide', () => {
    expect(parseCallbackUrl(`${REDIRECT}?code=XYZ%2B1&state=${STATE}`, REDIRECT, STATE)).toBe('XYZ+1');
  });

  it('aborta si el state no coincide (anti-CSRF), aunque traiga code', () => {
    expect(codeOf(() => parseCallbackUrl(`${REDIRECT}?code=XYZ&state=otro`, REDIRECT, STATE))).toBe('state_mismatch');
    expect(codeOf(() => parseCallbackUrl(`${REDIRECT}?code=XYZ`, REDIRECT, STATE))).toBe('state_mismatch');
  });

  it('el state se revisa antes que el error', () => {
    expect(codeOf(() => parseCallbackUrl(`${REDIRECT}?error=server_error&state=otro`, REDIRECT, STATE))).toBe(
      'state_mismatch',
    );
  });

  it('traduce los errores del servidor', () => {
    expect(codeOf(() => parseCallbackUrl(`${REDIRECT}?error=access_denied&state=${STATE}`, REDIRECT, STATE))).toBe(
      'cancelled',
    );
    expect(codeOf(() => parseCallbackUrl(`${REDIRECT}?error=invalid_request&state=${STATE}`, REDIRECT, STATE))).toBe(
      'authorization_denied',
    );
  });

  it('rechaza un redirect distinto o sin code', () => {
    expect(codeOf(() => parseCallbackUrl(`otra-app://callback?code=X&state=${STATE}`, REDIRECT, STATE))).toBe(
      'invalid_callback',
    );
    expect(codeOf(() => parseCallbackUrl(`${REDIRECT}?state=${STATE}`, REDIRECT, STATE))).toBe('invalid_callback');
  });
});
