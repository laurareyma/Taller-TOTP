import { nodeSha1 } from '../../../../test-utils/nodeSha1';
import { base32Decode } from '../base32';
import { counterToBytes, dynamicTruncate, generateHotp, generateTotp, secondsRemaining, timeStep } from '../totp';

// Secreto de prueba de los RFC 4226 y 6238: el texto ASCII "12345678901234567890".
const RFC_SECRET = new TextEncoder().encode('12345678901234567890');

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

describe('timeStep y secondsRemaining', () => {
  it('calcula T = floor(t / 30)', () => {
    expect(timeStep(0)).toBe(0);
    expect(timeStep(29_999)).toBe(0);
    expect(timeStep(30_000)).toBe(1);
    expect(timeStep(59_000)).toBe(1);
  });

  it('cuenta los segundos restantes de 30 a 1', () => {
    expect(secondsRemaining(0)).toBe(30);
    expect(secondsRemaining(1_000)).toBe(29);
    expect(secondsRemaining(29_999)).toBe(1);
    expect(secondsRemaining(30_000)).toBe(30);
  });
});

describe('counterToBytes', () => {
  it('produce 8 bytes Big-Endian', () => {
    expect(counterToBytes(1)).toEqual(hex('0000000000000001'));
    expect(counterToBytes(0x1_2345_6789)).toEqual(hex('0000000123456789'));
  });

  it('rechaza contadores inválidos', () => {
    expect(() => counterToBytes(-1)).toThrow(RangeError);
    expect(() => counterToBytes(1.5)).toThrow(RangeError);
  });
});

describe('dynamicTruncate', () => {
  it('reproduce el ejemplo del RFC 4226 §5.4', () => {
    const hmac = hex('1f8698690e02ca16618550ef7f19da8e945b555a');
    expect(dynamicTruncate(hmac)).toBe(0x50ef7f19);
    expect(dynamicTruncate(hmac) % 1_000_000).toBe(872921);
  });
});

describe('HOTP — vectores del RFC 4226 (Apéndice D)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

  it.each(expected.map((code, counter) => [counter, code]))('contador %i → %s', async (counter, code) => {
    await expect(generateHotp(RFC_SECRET, counter as number, nodeSha1)).resolves.toBe(code);
  });
});

describe('TOTP — vectores del RFC 6238 (Apéndice B, SHA1, 8 dígitos)', () => {
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vectors)('t = %i s → %s', async (seconds, code) => {
    await expect(generateTotp(RFC_SECRET, nodeSha1, { timestampMs: seconds * 1000, digits: 8 })).resolves.toBe(code);
  });

  it('con 6 dígitos conserva los ceros a la izquierda', async () => {
    await expect(generateTotp(RFC_SECRET, nodeSha1, { timestampMs: 1111111109_000 })).resolves.toBe('081804');
  });

  it('da el mismo resultado partiendo de la semilla en Base32', async () => {
    const secret = base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    await expect(generateTotp(secret, nodeSha1, { timestampMs: 59_000, digits: 8 })).resolves.toBe('94287082');
  });

  it('el código cambia solo al cruzar la ventana de 30 s', async () => {
    const at = (s: number) => generateTotp(RFC_SECRET, nodeSha1, { timestampMs: s * 1000 });
    expect(await at(30)).toBe(await at(59));
    expect(await at(59)).not.toBe(await at(60));
  });

  it('rechaza cantidades de dígitos fuera de 6-8', async () => {
    await expect(generateTotp(RFC_SECRET, nodeSha1, { digits: 5 })).rejects.toThrow(RangeError);
  });
});
