import { formatCode, parseStoredAccount } from '../accountSchema';

const valid = {
  secret: 'JBSWY3DPEHPK3PXP',
  issuer: 'UniSabana',
  accountName: 'estudiante@unisabana.edu.co',
  digits: 6,
  period: 30,
};

describe('parseStoredAccount', () => {
  it('recupera una cuenta guardada', () => {
    expect(parseStoredAccount(JSON.stringify(valid))).toEqual(valid);
  });

  it('acepta issuer null', () => {
    expect(parseStoredAccount(JSON.stringify({ ...valid, issuer: null }))).toMatchObject({ issuer: null });
  });

  it.each([
    ['vacío', null],
    ['JSON inválido', '{no es json'],
    ['no es objeto', '"texto"'],
    ['semilla inválida', JSON.stringify({ ...valid, secret: 'abc1' })],
    ['digits fuera de rango', JSON.stringify({ ...valid, digits: 4 })],
    ['period 0', JSON.stringify({ ...valid, period: 0 })],
    ['falta accountName', JSON.stringify({ ...valid, accountName: undefined })],
  ])('devuelve null si el dato es %s', (_, raw) => {
    expect(parseStoredAccount(raw)).toBeNull();
  });
});

describe('formatCode', () => {
  it('separa en dos grupos', () => {
    expect(formatCode('054231')).toBe('054 231');
    expect(formatCode('12345678')).toBe('1234 5678');
  });
});
