/**
 * Step-Up Authentication del lado de la app.
 *
 * fetchVault():
 *   1. Si hay elevated_token vigente → GET /api/boveda-critica con él.
 *   2. Si no → GET con el access token normal (por el cliente con Silent Refresh).
 *      El backend responde 403 mfa_required + step_up_token → StepUpRequiredError.
 * verifyMfa(): envía step_up_token + código TOTP y guarda el elevated_token en memoria.
 */

import { ApiError } from '@/features/auth/apiClient';
import { request } from '@/features/auth/authApi';
import { networkLog } from '@/features/auth/networkLog';
import { api } from '@/features/auth/session';
import { memorySession } from '@/features/auth/tokenStorage';

const VAULT_PATH = '/api/boveda-critica';

export interface VaultItem {
  label: string;
  value: string;
}

export interface VaultData {
  owner: string;
  unlocked_at: number;
  elevated_until: number;
  items: VaultItem[];
}

export class StepUpRequiredError extends Error {
  constructor(
    readonly stepUpToken: string,
    /** Instante (ms) en que vence el step_up_token. */
    readonly expiresAt: number,
  ) {
    super('Se requiere verificación en dos pasos.');
    this.name = 'StepUpRequiredError';
  }
}

export type MfaErrorCode =
  | 'invalid_code'
  | 'invalid_request'
  | 'replay_detected'
  | 'too_many_attempts'
  | 'step_up_expired'
  | 'server';

export class MfaError extends Error {
  constructor(
    readonly code: MfaErrorCode,
    message: string,
    readonly status: number,
    readonly attemptsLeft?: number,
  ) {
    super(message);
    this.name = 'MfaError';
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

/** Convierte el 403 mfa_required en StepUpRequiredError; deja pasar cualquier otro error. */
export function toStepUpError(error: unknown, now = Date.now()): unknown {
  if (error instanceof ApiError && error.status === 403 && error.body.error === 'mfa_required') {
    const token = error.body.step_up_token;
    const expiresIn = typeof error.body.step_up_expires_in === 'number' ? error.body.step_up_expires_in : 120;
    if (typeof token === 'string') return new StepUpRequiredError(token, now + expiresIn * 1000);
  }
  return error;
}

async function getWithElevatedToken(token: string): Promise<VaultData | null> {
  const response = await request(VAULT_PATH, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  networkLog.add(`GET ${VAULT_PATH} (elevated) → ${response.status}`, response.ok ? 'ok' : 'warn');
  if (response.ok) return (await response.json()) as VaultData;
  if (response.status === 401 || response.status === 403) {
    memorySession.clearElevated(); // venció: hay que volver a pedir el segundo factor
    return null;
  }
  throw new ApiError(response.status, await readJson(response));
}

export async function fetchVault(): Promise<VaultData> {
  const elevated = memorySession.elevatedToken;
  if (elevated) {
    const data = await getWithElevatedToken(elevated);
    if (data) return data;
  }
  try {
    return await api.getJson<VaultData>(VAULT_PATH);
  } catch (error) {
    throw toStepUpError(error);
  }
}

/** Pide un step_up_token nuevo con el access token normal (para la prueba de replay). */
export async function requestStepUpToken(): Promise<StepUpRequiredError> {
  try {
    await api.getJson(VAULT_PATH);
  } catch (error) {
    const stepUp = toStepUpError(error);
    if (stepUp instanceof StepUpRequiredError) return stepUp;
    throw error;
  }
  throw new Error('El servidor no pidió segundo factor.');
}

export function mfaErrorFromResponse(status: number, body: Record<string, unknown>): MfaError {
  const description = typeof body.error_description === 'string' ? body.error_description : `HTTP ${status}`;
  const attemptsLeft = typeof body.attempts_left === 'number' ? body.attempts_left : undefined;
  if (status === 409) return new MfaError('replay_detected', description, status);
  if (status === 429) return new MfaError('too_many_attempts', description, status);
  if (status === 401) return new MfaError('step_up_expired', 'La verificación expiró. Solicítala de nuevo.', status);
  if (status === 400 && body.error === 'invalid_code') return new MfaError('invalid_code', description, status, attemptsLeft);
  if (status === 400) return new MfaError('invalid_request', description, status);
  return new MfaError('server', description, status);
}

/** POST /auth/mfa/verify. No pasa por el interceptor: aquí un error no significa sesión vencida. */
export async function verifyMfa(stepUpToken: string, code: string): Promise<void> {
  const response = await request('/auth/mfa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ step_up_token: stepUpToken, code }),
  });
  const body = await readJson(response);
  networkLog.add(`POST /auth/mfa/verify → ${response.status}`, response.ok ? 'ok' : response.status === 409 ? 'error' : 'warn');

  if (!response.ok) throw mfaErrorFromResponse(response.status, body);
  if (typeof body.elevated_token !== 'string' || typeof body.expires_in !== 'number') {
    throw new MfaError('server', 'Respuesta inválida del servidor.', response.status);
  }
  memorySession.setElevated(body.elevated_token, Date.now() + body.expires_in * 1000);
}
