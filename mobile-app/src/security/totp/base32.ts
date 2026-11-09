/**
 * Decodificador Base32 (RFC 4648) para las semillas TOTP.
 * Google Authenticator y los URI otpauth:// entregan el secreto en Base32.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4226 exige mínimo 128 bits de secreto; aceptamos desde 80 bits (16 caracteres), como Google Authenticator. */
export const MIN_SECRET_LENGTH = 16;

export class Base32Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Base32Error';
  }
}

/** Quita espacios, guiones y relleno '=', y pasa a mayúsculas. */
export function normalizeBase32(input: string): string {
  return input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
}

/**
 * Valida una semilla escrita por el usuario.
 * Devuelve un mensaje de error para mostrar en la UI, o null si es válida.
 */
export function validateBase32Secret(input: string): string | null {
  const secret = normalizeBase32(input);
  if (secret.length === 0) return 'Ingresa la semilla Base32.';
  if (!/^[A-Z2-7]+$/.test(secret)) return 'Solo se permiten letras A-Z y dígitos 2-7.';
  if (secret.length < MIN_SECRET_LENGTH) {
    return `La semilla debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`;
  }
  return null;
}

/** Convierte texto Base32 en bytes. Cada carácter aporta 5 bits. */
export function base32Decode(input: string): Uint8Array {
  const secret = normalizeBase32(input);
  if (secret.length === 0 || !/^[A-Z2-7]+$/.test(secret)) {
    throw new Base32Error('Semilla Base32 inválida.');
  }

  const bytes: number[] = [];
  let buffer = 0; // bits pendientes
  let bits = 0; // cuántos bits hay en el buffer

  for (const char of secret) {
    buffer = (buffer << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
    buffer &= (1 << bits) - 1; // conserva solo los bits que faltan por usar
  }

  return Uint8Array.from(bytes);
}
