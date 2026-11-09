import { RefreshQueue } from '../refreshQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('RefreshQueue', () => {
  it('varias llamadas simultáneas disparan UNA sola renovación y reciben el mismo token', async () => {
    const pending = deferred<string>();
    const doRefresh = jest.fn(() => pending.promise);
    const queue = new RefreshQueue(doRefresh);

    const calls = [queue.refresh(), queue.refresh(), queue.refresh()];
    expect(queue.isRefreshing).toBe(true);
    expect(queue.size).toBe(3);
    expect(doRefresh).toHaveBeenCalledTimes(1);

    pending.resolve('token-nuevo');
    await expect(Promise.all(calls)).resolves.toEqual(['token-nuevo', 'token-nuevo', 'token-nuevo']);
    expect(queue.isRefreshing).toBe(false);
    expect(queue.size).toBe(0);
  });

  it('si la renovación falla, todas las peticiones encoladas reciben el error', async () => {
    const pending = deferred<string>();
    const queue = new RefreshQueue(() => pending.promise);
    const calls = [queue.refresh(), queue.refresh()];

    pending.reject(new Error('sesión expirada'));
    const results = await Promise.allSettled(calls);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(queue.isRefreshing).toBe(false);
  });

  it('después de terminar, una nueva llamada inicia otra renovación', async () => {
    const doRefresh = jest.fn().mockResolvedValueOnce('t1').mockResolvedValueOnce('t2');
    const queue = new RefreshQueue(doRefresh);
    await expect(queue.refresh()).resolves.toBe('t1');
    await expect(queue.refresh()).resolves.toBe('t2');
    expect(doRefresh).toHaveBeenCalledTimes(2);
  });
});
