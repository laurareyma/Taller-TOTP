/**
 * Imprime en la terminal un QR otpauth:// para escanearlo con la app Y con Google Authenticator
 * (prueba de aceptación #2: paridad).
 *
 *   npm run qr                          → semilla de ejemplo JBSWY3DPEHPK3PXP
 *   npm run qr -- --random              → semilla nueva aleatoria de 160 bits
 *   npm run qr -- TU_SEMILLA --account=ana@unisabana.edu.co
 */

import { randomBytes } from 'node:crypto';
import qrcode from 'qrcode-terminal';

import { validateBase32Secret } from '../src/security/totp/base32';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Codificador Base32 sin relleno (solo lo necesita este script). */
function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

const args = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const positional = args.find((a) => !a.startsWith('--'));

const secret = args.includes('--random') ? base32Encode(randomBytes(20)) : (positional ?? 'JBSWY3DPEHPK3PXP');
const error = validateBase32Secret(secret);
if (error) {
  console.error(error);
  process.exit(1);
}

const issuer = 'UniSabana';
const account = option('account') ?? 'estudiante@unisabana.edu.co';
const uri =
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

console.log(`Semilla: ${secret}\nURI:     ${uri}\n`);
qrcode.generate(uri, { small: true });
console.log(`\nVerifica el código con: npm run totp -- ${secret} --watch`);
