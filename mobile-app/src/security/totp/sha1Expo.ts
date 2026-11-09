import * as Crypto from 'expo-crypto';

import type { Sha1Fn } from './hmacSha1';

/** SHA-1 nativo del dispositivo (vía expo-crypto). No usa la red. */
export const sha1Expo: Sha1Fn = async (data) => {
  // La copia garantiza un ArrayBuffer normal (no SharedArrayBuffer), que es lo que pide el tipo BufferSource.
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA1, new Uint8Array(data));
  return new Uint8Array(digest);
};
