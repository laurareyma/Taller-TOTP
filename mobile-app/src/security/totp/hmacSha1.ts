/**
 * HMAC-SHA1 (RFC 2104) construido sobre una función SHA-1 cualquiera.
 *
 * expo-crypto solo ofrece hashes (no HMAC), así que armamos el HMAC a mano:
 *   HMAC(K, m) = SHA1( (K' ⊕ opad) ‖ SHA1( (K' ⊕ ipad) ‖ m ) )
 * La función SHA-1 se inyecta para poder usar expo-crypto en la app
 * y el módulo crypto de Node en las pruebas.
 */

export type Sha1Fn = (data: Uint8Array) => Promise<Uint8Array>;

const BLOCK_SIZE = 64; // tamaño de bloque de SHA-1 en bytes
const IPAD = 0x36;
const OPAD = 0x5c;

export async function hmacSha1(key: Uint8Array, message: Uint8Array, sha1: Sha1Fn): Promise<Uint8Array> {
  // Una llave más larga que el bloque se reemplaza por su hash; luego se rellena con ceros.
  const shortKey = key.length > BLOCK_SIZE ? await sha1(key) : key;
  const paddedKey = new Uint8Array(BLOCK_SIZE);
  paddedKey.set(shortKey);

  const inner = new Uint8Array(BLOCK_SIZE + message.length);
  const outer = new Uint8Array(BLOCK_SIZE + 20); // 20 = tamaño del hash SHA-1
  for (let i = 0; i < BLOCK_SIZE; i++) {
    inner[i] = paddedKey[i] ^ IPAD;
    outer[i] = paddedKey[i] ^ OPAD;
  }

  inner.set(message, BLOCK_SIZE);
  outer.set(await sha1(inner), BLOCK_SIZE);
  return sha1(outer);
}
