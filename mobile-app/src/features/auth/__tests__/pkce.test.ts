import { createHash, randomBytes } from 'node:crypto';

import { base64UrlEncode, createCodeChallenge, createCodeVerifier, createState, type RandomBytesFn, type Sha256Fn } from '../pkce';

const nodeSha256: Sha256Fn = async (data) => new Uint8Array(createHash('sha256').update(data).digest());
const nodeRandom: RandomBytesFn = async (n) => new Uint8Array(randomBytes(n));

describe('base64UrlEncode', () => {
  it.each([
    [[], ''],
    [[0xfb], '-w'],
    [[0xfb, 0xff], '-_8'],
    [[0xfb, 0xff, 0xbf], '-_-_'],
  ])('%j → %s', (bytes, expected) => {
    expect(base64UrlEncode(Uint8Array.from(bytes))).toBe(expected);
  });

  it('coincide con Buffer base64url para datos aleatorios', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = randomBytes(n);
      expect(base64UrlEncode(bytes)).toBe(bytes.toString('base64url'));
    }
  });
});

describe('PKCE', () => {
  it('reproduce el vector del RFC 7636 (Apéndice B)', async () => {
    await expect(createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', nodeSha256)).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('el code_verifier tiene 43 caracteres URL-safe y cambia cada vez', async () => {
    const a = await createCodeVerifier(nodeRandom);
    const b = await createCodeVerifier(nodeRandom);
    expect(a).toMatch(/^[A-Za-z0-9\-._~]{43}$/);
    expect(a).not.toBe(b);
  });

  it('el code_challenge es SHA-256 en Base64URL sin relleno (43 caracteres)', async () => {
    const challenge = await createCodeChallenge(await createCodeVerifier(nodeRandom), nodeSha256);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });

  it('el state es aleatorio', async () => {
    expect(await createState(nodeRandom)).not.toBe(await createState(nodeRandom));
  });
});
