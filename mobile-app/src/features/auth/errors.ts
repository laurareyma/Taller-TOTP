export type AuthErrorCode =
  | 'cancelled' // el usuario cerró el navegador
  | 'state_mismatch' // posible ataque CSRF: se aborta el intercambio
  | 'authorization_denied' // el servidor devolvió ?error=...
  | 'invalid_callback'
  | 'session_expired' // refresh token vencido o revocado
  | 'network'
  | 'server';

const MESSAGES: Record<AuthErrorCode, string> = {
  cancelled: 'Inicio de sesión cancelado.',
  state_mismatch: 'La respuesta del servidor no corresponde a esta solicitud. Se abortó el inicio de sesión.',
  authorization_denied: 'El servidor rechazó la autorización.',
  invalid_callback: 'La respuesta del servidor está incompleta.',
  session_expired: 'Tu sesión expiró. Inicia sesión de nuevo.',
  network: 'No hay conexión con el servidor.',
  server: 'El servidor respondió con un error.',
};

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    detail?: string,
  ) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = 'AuthError';
  }
}
