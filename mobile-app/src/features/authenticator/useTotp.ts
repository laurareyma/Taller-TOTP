/**
 * Calcula el código TOTP de la cuenta y lo renueva solo al cambiar la ventana de 30 s.
 * Todo es local (sin red), así que funciona en Modo Avión.
 */

import { useEffect, useState } from 'react';

import { base32Decode } from '@/security/totp/base32';
import { sha1Expo } from '@/security/totp/sha1Expo';
import { generateTotp, secondsRemaining, timeStep } from '@/security/totp/totp';

import type { TotpAccount } from './accountSchema';

export interface TotpState {
  /** null solo antes del primer cálculo. */
  code: string | null;
  secondsLeft: number;
  /** Instante (ms Unix) en que vence el código actual. */
  expiresAtMs: number;
  error: string | null;
}

export function useTotp(account: TotpAccount): TotpState {
  const [state, setState] = useState<TotpState>({
    code: null,
    secondsLeft: account.period,
    expiresAtMs: 0,
    error: null,
  });

  useEffect(() => {
    const { period, digits } = account;
    const secret = base32Decode(account.secret);
    let active = true;
    let lastStep = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const now = Date.now();
      const step = timeStep(now, period);
      const secondsLeft = secondsRemaining(now, period);

      try {
        if (step !== lastStep) {
          // El código anterior sigue en pantalla hasta tener el nuevo: no hay parpadeo.
          const code = await generateTotp(secret, sha1Expo, { timestampMs: now, period, digits });
          if (!active) return;
          lastStep = step;
          setState({ code, secondsLeft, expiresAtMs: (step + 1) * period * 1000, error: null });
        } else {
          setState((prev) => (prev.secondsLeft === secondsLeft ? prev : { ...prev, secondsLeft }));
        }
      } catch {
        if (active) setState((prev) => ({ ...prev, error: 'No se pudo calcular el código.' }));
      }

      // Se programa justo después del siguiente cambio de segundo, para no acumular desfase.
      if (active) timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
    };

    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [account]);

  return state;
}
