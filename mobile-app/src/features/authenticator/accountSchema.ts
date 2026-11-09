/**
 * Validación de la cuenta TOTP guardada. Es lógica pura (sin SecureStore) para poder probarla.
 */

import { validateBase32Secret } from '@/security/totp/base32';
import type { OtpauthAccount } from '@/security/totp/otpauth';

export type TotpAccount = OtpauthAccount;

/** Convierte el JSON guardado en una cuenta válida, o null si está corrupto o incompleto. */
export function parseStoredAccount(raw: string | null): TotpAccount | null {
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const v = value as Record<string, unknown>;
  const valid =
    typeof v.secret === 'string' &&
    validateBase32Secret(v.secret) === null &&
    (v.issuer === null || typeof v.issuer === 'string') &&
    typeof v.accountName === 'string' &&
    Number.isInteger(v.digits) &&
    (v.digits as number) >= 6 &&
    (v.digits as number) <= 8 &&
    Number.isInteger(v.period) &&
    (v.period as number) > 0;

  if (!valid) return null;
  return {
    secret: v.secret as string,
    issuer: v.issuer as string | null,
    accountName: v.accountName as string,
    digits: v.digits as number,
    period: v.period as number,
  };
}

/** Formatea el código en dos grupos para leerlo mejor: "123 456" o "1234 5678". */
export function formatCode(code: string): string {
  const half = Math.floor(code.length / 2);
  return code.length >= 6 ? `${code.slice(0, half)} ${code.slice(half)}` : code;
}
