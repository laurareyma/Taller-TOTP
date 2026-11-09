/**
 * PKCE (RFC 7636) del lado de la app. Lógica pura: el azar y el SHA-256 se inyectan
 * (expo-crypto en la app, node:crypto en las pruebas).
 */

export type RandomBytesFn = (length: number) => Promise<Uint8Array>;
export type Sha256Fn = (data: Uint8Array) => Promise<Uint8Array>;

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64URL sin relleno '=' (RFC 4648 §5). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63] + BASE64URL[(n >> 6) & 63] + BASE64URL[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63] + BASE64URL[(n >> 6) & 63];
  }
  return out;
}

/**
 * code_verifier: 32 bytes aleatorios en Base64URL = 43 caracteres de [A-Za-z0-9-_],
 * dentro del rango 43–128 que exige el RFC y con 256 bits de entropía.
 */
export async function createCodeVerifier(randomBytes: RandomBytesFn): Promise<string> {
  return base64UrlEncode(await randomBytes(32));
}

/** code_challenge = BASE64URL( SHA256( ASCII(code_verifier) ) ) */
export async function createCodeChallenge(codeVerifier: string, sha256: Sha256Fn): Promise<string> {
  const ascii = Uint8Array.from(codeVerifier, (char) => char.charCodeAt(0));
  return base64UrlEncode(await sha256(ascii));
}

/** state anti-CSRF: 128 bits aleatorios, uno nuevo por cada intento de login. */
export async function createState(randomBytes: RandomBytesFn): Promise<string> {
  return base64UrlEncode(await randomBytes(16));
}
