import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { revokeSession } from './authApi';
import { AuthError } from './errors';
import { networkLog } from './networkLog';
import { clearLocalSession, onSessionExpired, refreshQueue, startSession } from './session';
import { signInWithBrowser } from './signIn';
import { loadRefreshToken } from './tokenStorage';

export type AuthStatus = 'restoring' | 'signedOut' | 'signingIn' | 'signedIn';

interface AuthValue {
  status: AuthStatus;
  /** Mensaje para mostrar en la UI (null si no hay error). */
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Vuelve a la primera pantalla del stack (bienvenida). */
function goToWelcome() {
  try {
    if (router.canDismiss()) router.dismissAll();
  } catch {
    // la navegación aún no está montada (arranque de la app)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [error, setError] = useState<string | null>(null);
  const signingIn = useRef(false);

  // Si el refresh token venció o fue revocado, session.ts ya borró todo: solo falta la UI.
  useEffect(
    () =>
      onSessionExpired(() => {
        setStatus('signedOut');
        setError(new AuthError('session_expired').message);
        goToWelcome();
      }),
    [],
  );

  // Al abrir la app: si hay refresh token guardado, se pide un access token sin mostrar el login.
  useEffect(() => {
    let active = true;
    (async () => {
      const refreshToken = await loadRefreshToken().catch(() => null);
      if (!refreshToken) {
        if (active) setStatus('signedOut');
        return;
      }
      try {
        await refreshQueue.refresh();
        if (active) setStatus('signedIn');
      } catch (e) {
        if (!active) return;
        // session_expired ya lo manejó onSessionExpired; sin red se conserva el refresh token.
        if (!(e instanceof AuthError && e.code === 'session_expired')) {
          setError(e instanceof Error ? e.message : 'No se pudo restaurar la sesión.');
          setStatus('signedOut');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    if (signingIn.current) return; // evita abrir dos navegadores con dos taps
    signingIn.current = true;
    setError(null);
    setStatus('signingIn');
    try {
      await startSession(await signInWithBrowser());
      networkLog.clear();
      setStatus('signedIn');
    } catch (e) {
      await clearLocalSession();
      const cancelled = e instanceof AuthError && e.code === 'cancelled';
      setError(cancelled ? null : e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
      setStatus('signedOut');
    } finally {
      signingIn.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await loadRefreshToken().catch(() => null);
    await clearLocalSession();
    networkLog.clear();
    setError(null);
    setStatus('signedOut');
    goToWelcome();
    if (refreshToken) void revokeSession(refreshToken);
  }, []);

  const value = useMemo(() => ({ status, error, signIn, signOut }), [status, error, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return value;
}
