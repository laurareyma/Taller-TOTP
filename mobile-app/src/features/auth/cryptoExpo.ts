import * as Crypto from 'expo-crypto';

import type { RandomBytesFn, Sha256Fn } from './pkce';

/**
 * Azar criptográfico del sistema operativo.
 * Se usa la versión asíncrona: según la documentación, la síncrona puede caer en Math.random en desarrollo.
 */
export const randomBytesExpo: RandomBytesFn = (length) => Crypto.getRandomBytesAsync(length);

export const sha256Expo: Sha256Fn = async (data) =>
  new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(data)));
