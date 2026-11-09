/**
 * HOTP (RFC 4226) y TOTP (RFC 6238) implementados desde cero.
 * Todo se calcula localmente: funciona en Modo Avión.
 */

import { hmacSha1, type Sha1Fn } from './hmacSha1';

export const DEFAULT_PERIOD = 30;
export const DEFAULT_DIGITS = 6;

export interface TotpOptions {
  /** Instante a usar, en milisegundos Unix. Por defecto, Date.now(). */
  timestampMs?: number;
  /** Duración de la ventana en segundos. */
  period?: number;
  /** Cantidad de dígitos del código (6 a 8). */
  digits?: number;
}

/** T = floor(UnixTimestamp / 30) */
export function timeStep(timestampMs: number, period = DEFAULT_PERIOD): number {
  return Math.floor(timestampMs / 1000 / period);
}

/** Segundos que le quedan al código actual (30 → 1). Sirve para el temporizador de la UI. */
export function secondsRemaining(timestampMs: number, period = DEFAULT_PERIOD): number {
  return period - (Math.floor(timestampMs / 1000) % period);
}

/**
 * Contador como entero de 64 bits Big-Endian (8 bytes).
 * Los operadores de bits de JS trabajan con 32 bits, así que se escribe en dos mitades.
 */
export function counterToBytes(counter: number): Uint8Array {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError('El contador debe ser un entero no negativo.');
  }
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32)); // 32 bits altos
  view.setUint32(4, counter >>> 0); // 32 bits bajos
  return bytes;
}

/**
 * Truncamiento dinámico (RFC 4226 §5.3):
 * offset = último nibble del HMAC; se toman 4 bytes desde ahí y se descarta el bit de signo.
 */
export function dynamicTruncate(hmac: Uint8Array): number {
  const offset = hmac[hmac.length - 1] & 0x0f; // H[19] & 0x0F
  return (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  );
}

/** HOTP: código para un contador dado, con ceros a la izquierda. */
export async function generateHotp(
  secret: Uint8Array,
  counter: number,
  sha1: Sha1Fn,
  digits = DEFAULT_DIGITS,
): Promise<string> {
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw new RangeError('digits debe estar entre 6 y 8.');
  }
  const hmac = await hmacSha1(secret, counterToBytes(counter), sha1);
  const code = dynamicTruncate(hmac) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

/** TOTP: HOTP usando como contador la ventana de tiempo actual. */
export async function generateTotp(secret: Uint8Array, sha1: Sha1Fn, options: TotpOptions = {}): Promise<string> {
  const { timestampMs = Date.now(), period = DEFAULT_PERIOD, digits = DEFAULT_DIGITS } = options;
  return generateHotp(secret, timeStep(timestampMs, period), sha1, digits);
}
