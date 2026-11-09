import { Base32Error, base32Decode, normalizeBase32, validateBase32Secret } from '../base32';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('base32Decode', () => {
  it('decodifica el secreto de los RFC', () => {
    expect(text(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'))).toBe('12345678901234567890');
  });

  it('decodifica la semilla del ejemplo de la guía', () => {
    expect(base32Decode('JBSWY3DPEHPK3PXP')).toEqual(
      Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]),
    );
  });

  it('decodifica los vectores del RFC 4648', () => {
    expect(text(base32Decode('MY'))).toBe('f');
    expect(text(base32Decode('MZXQ===='))).toBe('fo');
    expect(text(base32Decode('MZXW6YTBOI======'))).toBe('foobar');
  });

  it('tolera minúsculas, espacios y guiones', () => {
    expect(base32Decode('jbsw y3dp-ehpk 3pxp')).toEqual(base32Decode('JBSWY3DPEHPK3PXP'));
  });

  it('lanza error con caracteres fuera del alfabeto', () => {
    expect(() => base32Decode('JBSWY3DP0')).toThrow(Base32Error);
    expect(() => base32Decode('')).toThrow(Base32Error);
  });
});

describe('normalizeBase32', () => {
  it('quita relleno y espacios', () => {
    expect(normalizeBase32(' mzxq==== ')).toBe('MZXQ');
  });
});

describe('validateBase32Secret', () => {
  it('acepta una semilla válida', () => {
    expect(validateBase32Secret('JBSWY3DPEHPK3PXP')).toBeNull();
  });

  it('explica el error en cada caso', () => {
    expect(validateBase32Secret('   ')).toMatch(/Ingresa/);
    expect(validateBase32Secret('JBSWY3DPEHPK3PX1')).toMatch(/A-Z/);
    expect(validateBase32Secret('JBSWY3DP')).toMatch(/al menos 16/);
  });
});
