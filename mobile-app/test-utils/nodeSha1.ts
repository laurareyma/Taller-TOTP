// Solo para pruebas y scripts en Node: nunca importar desde la app.
import { createHash } from 'node:crypto';

import type { Sha1Fn } from '../src/security/totp/hmacSha1';

export const nodeSha1: Sha1Fn = async (data) => new Uint8Array(createHash('sha1').update(data).digest());
