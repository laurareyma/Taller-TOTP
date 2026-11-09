import { ApiError } from '@/features/auth/apiClient';
import { memorySession } from '@/features/auth/tokenStorage';

import { MfaError, mfaErrorFromResponse, StepUpRequiredError, toStepUpError, verifyMfa } from '../vaultApi';

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('toStepUpError', () => {
  it('convierte 403 mfa_required en StepUpRequiredError', () => {
    const error = new ApiError(403, { error: 'mfa_required', step_up_token: 'su', step_up_expires_in: 120 });
    const result = toStepUpError(error, 1_000);
    expect(result).toBeInstanceOf(StepUpRequiredError);
    expect(result).toMatchObject({ stepUpToken: 'su', expiresAt: 121_000 });
  });

  it('deja pasar otros 403 y otros errores', () => {
    const forbidden = new ApiError(403, { error: 'forbidden' });
    expect(toStepUpError(forbidden)).toBe(forbidden);
    const other = new Error('x');
    expect(toStepUpError(other)).toBe(other);
  });
});

describe('mfaErrorFromResponse', () => {
  it.each([
    [409, { error: 'replay_detected', error_description: 'Replay Attack Detected' }, 'replay_detected'],
    [429, { error: 'too_many_attempts' }, 'too_many_attempts'],
    [401, { error: 'invalid_token' }, 'step_up_expired'],
    [400, { error: 'invalid_code', attempts_left: 3 }, 'invalid_code'],
    [400, { error: 'invalid_request' }, 'invalid_request'],
    [500, {}, 'server'],
  ])('%i → %s', (status, body, code) => {
    expect(mfaErrorFromResponse(status, body).code).toBe(code);
  });

  it('conserva los intentos restantes', () => {
    expect(mfaErrorFromResponse(400, { error: 'invalid_code', attempts_left: 2 }).attemptsLeft).toBe(2);
  });
});

describe('verifyMfa', () => {
  beforeEach(() => memorySession.clear());

  it('envía step_up_token + código y guarda el elevated_token solo en memoria', async () => {
    const fetchMock = mockFetch(200, { elevated_token: 'elev', token_type: 'Bearer', expires_in: 600 });
    await verifyMfa('su', '123456');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/auth/mfa/verify');
    expect(JSON.parse(init.body)).toEqual({ step_up_token: 'su', code: '123456' });
    expect(memorySession.elevatedToken).toBe('elev');
    expect(memorySession.elevatedExpiresAt).toBeGreaterThan(Date.now() + 590_000);
  });

  it('un 409 se convierte en replay_detected y no eleva', async () => {
    mockFetch(409, { error: 'replay_detected', error_description: 'Replay Attack Detected' });
    await expect(verifyMfa('su', '123456')).rejects.toBeInstanceOf(MfaError);
    await expect(verifyMfa('su', '123456')).rejects.toMatchObject({ code: 'replay_detected', status: 409 });
    expect(memorySession.elevatedToken).toBeNull();
  });

  it('cerrar sesión borra también el elevated_token', async () => {
    mockFetch(200, { elevated_token: 'elev', expires_in: 600 });
    await verifyMfa('su', '123456');
    memorySession.clear();
    expect(memorySession.elevatedToken).toBeNull();
  });
});
