import { createHmac, randomBytes } from 'node:crypto';

import { nodeSha1 } from '../../../../test-utils/nodeSha1';
import { hmacSha1 } from '../hmacSha1';

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('hmacSha1', () => {
  it('cumple el caso de prueba 2 del RFC 2202', async () => {
    const key = new TextEncoder().encode('Jefe');
    const msg = new TextEncoder().encode('what do ya want for nothing?');
    expect(toHex(await hmacSha1(key, msg, nodeSha1))).toBe('effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
  });

  // Se compara contra el HMAC de Node solo como referencia; la app nunca lo usa.
  it.each([0, 1, 20, 63, 64, 65, 100])('coincide con el HMAC de Node para una llave de %i bytes', async (keyLength) => {
    const key = randomBytes(keyLength);
    const msg = randomBytes(8);
    const expected = createHmac('sha1', key).update(msg).digest('hex');
    expect(toHex(await hmacSha1(key, msg, nodeSha1))).toBe(expected);
  });
});
