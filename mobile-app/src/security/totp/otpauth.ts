/**
 * Lectura del URI que viene en el código QR:
 *   otpauth://totp/UniSabana:estudiante@unisabana.edu.co?secret=JBSWY3DPEHPK3PXP&issuer=UniSabana
 *
 * Se parsea a mano en vez de usar `URL`, porque el soporte de `URL` en React Native es incompleto.
 */

import { normalizeBase32, validateBase32Secret } from './base32';
import { DEFAULT_DIGITS, DEFAULT_PERIOD } from './totp';

export interface OtpauthAccount {
  secret: string; // Base32 normalizado
  issuer: string | null;
  accountName: string;
  digits: number;
  period: number;
}

export class OtpauthParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpauthParseError';
  }
}

const PREFIX = 'otpauth://';

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    throw new OtpauthParseError('El código QR tiene caracteres mal codificados.');
  }
}

function parsePositiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new OtpauthParseError(`Parámetro ${name} inválido.`);
  return Number(value);
}

export function parseOtpauthUri(uri: string): OtpauthAccount {
  const text = uri.trim();
  if (text.slice(0, PREFIX.length).toLowerCase() !== PREFIX) {
    throw new OtpauthParseError('El QR no es un código otpauth://.');
  }

  const rest = text.slice(PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash === -1) throw new OtpauthParseError('URI otpauth incompleto.');

  const type = rest.slice(0, slash).toLowerCase();
  if (type !== 'totp') throw new OtpauthParseError(`Tipo "${type}" no soportado: solo TOTP.`);

  const afterType = rest.slice(slash + 1);
  const questionMark = afterType.indexOf('?');
  const rawLabel = questionMark === -1 ? afterType : afterType.slice(0, questionMark);
  const rawQuery = questionMark === -1 ? '' : afterType.slice(questionMark + 1);

  const params: Record<string, string> = {};
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decode(eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
    params[key] = eq === -1 ? '' : decode(pair.slice(eq + 1));
  }

  const secretError = validateBase32Secret(params.secret ?? '');
  if (secretError) throw new OtpauthParseError(secretError);

  const algorithm = (params.algorithm ?? 'SHA1').toUpperCase();
  if (algorithm !== 'SHA1') throw new OtpauthParseError(`Algoritmo ${algorithm} no soportado: solo SHA1.`);

  const digits = parsePositiveInt(params.digits, DEFAULT_DIGITS, 'digits');
  if (digits < 6 || digits > 8) throw new OtpauthParseError('digits debe estar entre 6 y 8.');
  const period = parsePositiveInt(params.period, DEFAULT_PERIOD, 'period');
  if (period === 0) throw new OtpauthParseError('period debe ser mayor que 0.');

  // La etiqueta puede ser "Emisor:cuenta" o solo "cuenta".
  const label = decode(rawLabel);
  const colon = label.indexOf(':');
  const labelIssuer = colon === -1 ? null : label.slice(0, colon).trim();
  const accountName = (colon === -1 ? label : label.slice(colon + 1)).trim();

  return {
    secret: normalizeBase32(params.secret),
    issuer: params.issuer || labelIssuer || null,
    accountName,
    digits,
    period,
  };
}
