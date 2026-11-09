/**
 * Cola de renovación (Silent Refresh Queue).
 *
 * La primera llamada a refresh() dispara UNA sola renovación; las que llegan mientras tanto
 * se encolan y reciben el mismo resultado. Así nunca se envían dos POST /auth/refresh a la vez,
 * algo grave aquí: el backend rota el refresh token y, si ve uno reutilizado, revoca toda la sesión.
 */

interface Waiter {
  resolve: (accessToken: string) => void;
  reject: (error: unknown) => void;
}

export class RefreshQueue {
  private refreshing = false;
  private waiting: Waiter[] = [];

  constructor(private readonly doRefresh: () => Promise<string>) {}

  get isRefreshing(): boolean {
    return this.refreshing;
  }

  /** Cuántas peticiones esperan el token nuevo. */
  get size(): number {
    return this.waiting.length;
  }

  /** Devuelve el access token nuevo. Si ya hay una renovación en curso, solo espera en la cola. */
  refresh(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      if (this.refreshing) return;

      this.refreshing = true;
      this.doRefresh().then(
        (token) => this.flush({ ok: true, token }),
        (error: unknown) => this.flush({ ok: false, error }),
      );
    });
  }

  /** Desbloquea la cola: todas las peticiones reciben el token nuevo, o el mismo error. */
  private flush(result: { ok: true; token: string } | { ok: false; error: unknown }): void {
    const waiting = this.waiting;
    this.waiting = [];
    this.refreshing = false;
    for (const waiter of waiting) {
      if (result.ok) waiter.resolve(result.token);
      else waiter.reject(result.error);
    }
  }
}
