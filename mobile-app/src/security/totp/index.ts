/**
 * Punto de entrada del módulo TOTP para la app.
 * Las funciones puras viven en base32.ts, hmacSha1.ts, totp.ts y otpauth.ts.
 */

import { base32Decode } from './base32';
import { sha1Expo } from './sha1Expo';
import { generateTotp, type TotpOptions } from './totp';

export { Base32Error, MIN_SECRET_LENGTH, base32Decode, normalizeBase32, validateBase32Secret } from './base32';
export { hmacSha1, type Sha1Fn } from './hmacSha1';
export { OtpauthParseError, parseOtpauthUri, type OtpauthAccount } from './otpauth';
export {
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  counterToBytes,
  dynamicTruncate,
  generateHotp,
  generateTotp,
  secondsRemaining,
  timeStep,
  type TotpOptions,
} from './totp';

/** Código TOTP actual para una semilla Base32, calculado con el SHA-1 nativo del dispositivo. */
export function getTotpCode(secretBase32: string, options?: TotpOptions): Promise<string> {
  return generateTotp(base32Decode(secretBase32), sha1Expo, options);
}
