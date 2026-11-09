/**
 * Muestra en la terminal el código TOTP actual, para compararlo con Google Authenticator.
 *
 *   npm run totp                        → semilla de ejemplo JBSWY3DPEHPK3PXP
 *   npm run totp -- TU_SEMILLA_BASE32
 *   npm run totp -- TU_SEMILLA --watch  → se actualiza cada segundo (Ctrl+C para salir)
 */

import { nodeSha1 } from '../test-utils/nodeSha1';
import { base32Decode, validateBase32Secret } from '../src/security/totp/base32';
import { generateTotp, secondsRemaining } from '../src/security/totp/totp';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const secretArg = args.find((a) => !a.startsWith('--')) ?? 'JBSWY3DPEHPK3PXP';

const error = validateBase32Secret(secretArg);
if (error) {
  console.error(error);
  process.exit(1);
}
const secret = base32Decode(secretArg);

async function print() {
  const now = Date.now();
  const code = await generateTotp(secret, nodeSha1, { timestampMs: now });
  const line = `${code.slice(0, 3)} ${code.slice(3)}   (${String(secondsRemaining(now)).padStart(2)} s)`;
  if (watch) process.stdout.write(`\r${line}`);
  else console.log(line);
}

void print();
if (watch) setInterval(print, 1000);
