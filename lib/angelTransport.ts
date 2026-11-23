// Only market-data reads use automatic retries. Never use this for broker orders.
type FailureKind =
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'ACCESS'
  | 'UPSTREAM'
  | 'FORMAT'
  | 'NETWORK'
  | 'REJECTED';
export class AngelRequestError extends Error {
  constructor(
    public kind: FailureKind,
    public httpStatus: number,
    public retryable: boolean,
    message: string,
    public retryAfterMs = 1500
  ) {
    super(message);
  }
}
type Runtime = {
  fetcher: typeof fetch;
  pause: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
};
export function angelPause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
const defaults: Runtime = {
  fetcher: (...args) => fetch(...args),
  pause: angelPause,
  now: () => Date.now(),
};
export async function decodeAngelResponse(response: Response, label: string) {
  const raw = await response.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    /* classify the HTTP/text failure below */
  }
  const status = response.status;
  const detail = `${raw} ${data?.message || ''}`.toLowerCase();
  const suffix = ` (HTTP ${status}).`;
  // Angel sometimes returns its rate-limit message as plain text with HTTP 403.
  if (
    status === 429 ||
    /exceeding access rate|too many requests|rate.?limit/.test(detail)
  ) {
    const retry = response.headers.get('retry-after');
    const delay =
      retry && /^\d+(\.\d+)?$/.test(retry)
        ? Number(retry) * 1000
        : retry
          ? Math.max(0, Date.parse(retry) - Date.now())
          : 1500;
    throw new AngelRequestError(
      'RATE_LIMIT',
      status,
      true,
      `Angel ${label} rate limit; wait before rechecking${suffix}`,
      Number.isFinite(delay) ? Math.max(1500, delay) : 1500
    );
  }
  if (
    status === 401 ||
    data?.error_type === 'TokenException' ||
    /invalid token|token.*expired|session.*expired/.test(
      String(data?.message || '').toLowerCase()
    )
  )
    throw new AngelRequestError(
      'AUTH',
      status,
      false,
      `Angel session expired or rejected${suffix}`
    );
  if (status === 403)
    throw new AngelRequestError(
      'ACCESS',
      status,
      false,
      `Angel ${label} access denied; check SmartAPI account permissions${suffix}`
    );
  if (status >= 500)
    throw new AngelRequestError(
      'UPSTREAM',
      status,
      true,
      `Angel ${label} service unavailable${suffix}`
    );
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new AngelRequestError(
      'FORMAT',
      status,
      response.ok,
      `Angel ${label} returned an unreadable response${suffix}`
    );
  if (!response.ok || data.status === false)
    throw new AngelRequestError(
      'REJECTED',
      status,
      false,
      `Angel ${label} request rejected${suffix}`
    );
  return data;
}

// Per-instance serialization prevents overlapping route requests from creating bursts.
// It is not a distributed/account-wide rate limiter; other devices still share broker limits.
export function createAngelReader(overrides: Partial<Runtime> = {}) {
  const runtime = { ...defaults, ...overrides };
  const lanes = new Map<string, { tail: Promise<void>; nextAt: number }>();
  return async function read(
    url: string,
    init: RequestInit,
    label: string,
    retry = true
  ): Promise<any> {
    const signal = init.signal || undefined;
    let lane = lanes.get(url);
    if (!lane) {
      lane = { tail: Promise.resolve(), nextAt: 0 };
      lanes.set(url, lane);
    }
    const current = lane;
    const task = current.tail.then(async () => {
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        const wait = current.nextAt - runtime.now();
        if (wait > 0) await runtime.pause(wait, signal);
        signal?.throwIfAborted();
        current.nextAt = runtime.now() + 1100;
        try {
          const timeout = AbortSignal.timeout(7000);
          const response = await runtime.fetcher(url, {
            ...init,
            cache: 'no-store',
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
          return await decodeAngelResponse(response, label);
        } catch (cause) {
          signal?.throwIfAborted();
          const error =
            cause instanceof AngelRequestError
              ? cause
              : new AngelRequestError(
                  'NETWORK',
                  0,
                  true,
                  `Angel ${label} connection failed or timed out.`
                );
          const delay =
            error.kind === 'RATE_LIMIT'
              ? Math.max(error.retryAfterMs, 2000 * 2 ** attempt)
              : error.retryAfterMs;
          if (error.kind === 'RATE_LIMIT')
            current.nextAt = Math.max(current.nextAt, runtime.now() + delay);
          if (
            !retry ||
            attempt >= (error.kind === 'RATE_LIMIT' ? 2 : 1) ||
            !error.retryable ||
            error.retryAfterMs > 5000
          )
            throw error;
          console.warn('Angel read retry', {
            feed: label,
            kind: error.kind,
            status: error.httpStatus,
          });
          await runtime.pause(delay, signal);
        }
      }
    });
    current.tail = task.then(
      () => {},
      () => {}
    );
    if (!signal) return task;
    // A request waiting behind another caller must still honour its own deadline.
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      task.then(
        (data) => {
          signal.removeEventListener('abort', abort);
          resolve(data);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        }
      );
      if (signal.aborted) abort();
    });
  };
}
export const readAngel = createAngelReader();
