// Only these market reads and session login may use this transport; never orders.
import { AngelRequestError } from './angelErrors';
import { angelBudget } from './angelRateLimit';
export { AngelRequestError } from './angelErrors';
const LOGIN =
  'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword';
const ALLOWED = new Set([
  LOGIN,
  'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/',
  'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData',
]);
type Runtime = {
  fetcher: typeof fetch;
  pause: (ms: number, signal?: AbortSignal) => Promise<void>;
  acquire: (signal?: AbortSignal) => Promise<void>;
  defer: (ms: number, signal?: AbortSignal) => Promise<void>;
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
  acquire: (signal) => angelBudget.acquire(signal),
  defer: (ms, signal) => angelBudget.defer(ms, signal),
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
          : 0;
    throw new AngelRequestError(
      'RATE_LIMIT',
      status,
      true,
      `Angel ${label} rate limit; wait before rechecking${suffix}`,
      Number.isSafeInteger(Math.ceil(delay)) ? Math.max(0, Math.ceil(delay)) : 0
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

// A local queue avoids unnecessary contention. Every attempt also reserves the same
// atomic account-wide budget, including login and every automatic retry.
export function createAngelReader(overrides: Partial<Runtime> = {}) {
  const runtime = { ...defaults, ...overrides };
  let tail: Promise<void> = Promise.resolve();
  return async function read(
    url: string,
    init: RequestInit,
    label: string,
    retry = true
  ): Promise<any> {
    if (!ALLOWED.has(url))
      throw new AngelRequestError(
        'REJECTED',
        400,
        false,
        'Unsupported Angel endpoint. Only approved data reads and login are allowed.'
      );
    const signal = init.signal || undefined;
    const task = tail.then(async () => {
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        // Tracking errors are never converted into retryable broker/network errors.
        await runtime.acquire(signal);
        signal?.throwIfAborted();
        try {
          const timeout = AbortSignal.timeout(7000);
          const response = await runtime.fetcher(url, {
            ...init,
            cache: 'no-store',
            redirect: 'error',
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
          // Share explicit provider waits even when this caller has no retries left.
          if (error.kind === 'RATE_LIMIT' && error.retryAfterMs > 0)
            await runtime.defer(error.retryAfterMs, signal);
          if (
            !retry ||
            url === LOGIN ||
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
          // Rate-limit retries use the next shared slot, with no separate cooldown.
          if (error.kind !== 'RATE_LIMIT') await runtime.pause(1500, signal);
        }
      }
    });
    tail = task.then(
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
