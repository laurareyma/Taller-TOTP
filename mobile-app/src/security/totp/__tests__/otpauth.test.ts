import { OtpauthParseError, parseOtpauthUri } from '../otpauth';

describe('parseOtpauthUri', () => {
  it('lee el URI del ejemplo de la guía', () => {
    const uri = 'otpauth://totp/UniSabana:estudiante@unisabana.edu.co?secret=JBSWY3DPEHPK3PXP&issuer=UniSabana';
    expect(parseOtpauthUri(uri)).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'UniSabana',
      accountName: 'estudiante@unisabana.edu.co',
      digits: 6,
      period: 30,
    });
  });

  it('decodifica la etiqueta y toma el emisor de ella si falta el parámetro issuer', () => {
    const uri = 'otpauth://totp/Uni%20Sabana%3Aana%40unisabana.edu.co?secret=jbswy3dpehpk3pxp';
    expect(parseOtpauthUri(uri)).toMatchObject({
      issuer: 'Uni Sabana',
      accountName: 'ana@unisabana.edu.co',
      secret: 'JBSWY3DPEHPK3PXP',
    });
  });

  it('respeta digits, period y algorithm=SHA1', () => {
    const uri = 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=8&period=60&algorithm=SHA1';
    expect(parseOtpauthUri(uri)).toMatchObject({ digits: 8, period: 60 });
  });

  it.each([
    ['https://example.com', /otpauth/],
    ['otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP', /solo TOTP/],
    ['otpauth://totp/x?issuer=UniSabana', /Ingresa/],
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256', /solo SHA1/],
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=4', /digits/],
    ['otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=0', /period/],
  ])('rechaza %s', (uri, message) => {
    expect(() => parseOtpauthUri(uri)).toThrow(OtpauthParseError);
    expect(() => parseOtpauthUri(uri)).toThrow(message);
  });
});
