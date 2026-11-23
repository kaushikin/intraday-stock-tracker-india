// Server only. A single atomic ledger covers every deployment using this Angel client code.
import { createHash, randomUUID } from 'node:crypto';
import { AngelRequestError } from './angelErrors';

export const ANGEL_LIMITS = {
  second: 2,
  minute: 40,
  hour: 2000,
  spacingMs: 2000,
} as const;
const HOUR = 3_600_000;
// Includes time for in-flight requests from the previous deployment to finish.
export const ANGEL_TRACKING_WARMUP_MS = HOUR + 65_000;

// One persistent sorted set contains positive request timestamps and negative control
// timestamps. Losing the entire key triggers a fresh warm-up, never a fresh allowance.
// Redis TIME avoids disagreement between serverless workers' clocks. EVAL is atomic.
export const ANGEL_BUDGET_SCRIPT = `
local key = KEYS[1]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local oldClock = redis.call('ZSCORE', key, '__clock__')
if oldClock then now = math.max(now, -tonumber(oldClock)) end
local warm = redis.call('ZSCORE', key, '__warmup__')
if not warm then
  warm = -(now + 3665000)
  redis.call('ZADD', key, warm, '__warmup__', -1, '__pause__')
end
redis.call('ZADD', key, -now, '__clock__')
redis.call('ZREMRANGEBYSCORE', key, 0, now - 3600000)
local pause = -(tonumber(redis.call('ZSCORE', key, '__pause__')) or -1)
if ARGV[1] == 'pause' then
  pause = math.max(pause, now + tonumber(ARGV[3]))
  redis.call('ZADD', key, -pause, '__pause__')
end
local windows = {1000, 60000, 3600000}
local limits = {2, 40, 2000}
local counts = {}
local wait = math.max(0, -tonumber(warm) - now, pause - now)
local reason = 'ready'
if -tonumber(warm) > now then reason = 'warming' elseif pause > now then reason = 'provider' end
for i, window in ipairs(windows) do
  local count = redis.call('ZCOUNT', key, '(' .. (now - window), '+inf')
  counts[i] = count
  if count >= limits[i] then
    local oldest = redis.call('ZRANGEBYSCORE', key, '(' .. (now - window), '+inf', 'WITHSCORES', 'LIMIT', count - limits[i], 1)
    local delay = tonumber(oldest[2]) + window - now + 1
    if delay > wait then wait = delay; reason = 'budget' end
  end
end
local last = redis.call('ZREVRANGEBYSCORE', key, '+inf', 0, 'WITHSCORES', 'LIMIT', 0, 1)
if #last > 0 then
  local delay = tonumber(last[2]) + 2000 - now
  if delay > wait then wait = delay; reason = 'pacing' end
end
local granted = 0
if ARGV[1] == 'acquire' and wait <= 0 then
  redis.call('ZADD', key, now, ARGV[2])
  for i = 1, 3 do counts[i] = counts[i] + 1 end
  granted = 1
end
return {granted, math.ceil(wait), now, counts[1], counts[2], counts[3], reason}
`;
export type AngelBudgetSnapshot = {
  granted: boolean;
  retryAfterMs: number;
  checkedAt: string;
  used: { second: number; minute: number; hour: number };
  reason: 'ready' | 'warming' | 'provider' | 'budget' | 'pacing';
};
type Runtime = {
  fetcher: typeof fetch;
  now: () => number;
  pause: (ms: number, signal?: AbortSignal) => Promise<void>;
  config: () => { url: string; token: string; client: string };
};
function configuration() {
  const prefix =
    ['ANGEL_RATE_REDIS_REST', 'UPSTASH_REDIS_REST', 'KV_REST_API'].find(
      (p) => process.env[p + '_URL'] || process.env[p + '_TOKEN']
    ) || 'ANGEL_RATE_REDIS_REST';
  const url = process.env[prefix + '_URL'] || '';
  const token = process.env[prefix + '_TOKEN'] || '';
  const client = process.env.ANGEL_CLIENT_CODE?.trim().toUpperCase() || '';
  let valid = false;
  try {
    const u = new URL(url);
    valid =
      u.protocol === 'https:' &&
      u.hostname.endsWith('.upstash.io') &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/';
  } catch {}
  if (!valid || !token || !client)
    throw new AngelRequestError(
      'TRACKING_UNAVAILABLE',
      503,
      false,
      'Shared Angel request tracking is not configured. Broker requests are paused.'
    );
  return { url, token, client };
}
function pause(ms: number, signal?: AbortSignal) {
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
export function angelBudgetKey(client: string) {
  // Stable across API-key rotation, devices, deployments and environments.
  return (
    'angel:shared-budget:v1:' +
    createHash('sha256').update(client.trim().toUpperCase()).digest('hex')
  );
}
export function createAngelBudget(overrides: Partial<Runtime> = {}) {
  const runtime: Runtime = {
    fetcher: (...args) => fetch(...args),
    now: () => Date.now(),
    pause,
    config: configuration,
    ...overrides,
  };
  async function execute(
    mode: 'status' | 'acquire' | 'pause',
    signal?: AbortSignal,
    delay = 0
  ): Promise<AngelBudgetSnapshot> {
    signal?.throwIfAborted();
    const config = runtime.config();
    try {
      const response = await runtime.fetcher(config.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          'EVAL',
          ANGEL_BUDGET_SCRIPT,
          1,
          angelBudgetKey(config.client),
          mode,
          randomUUID(),
          delay,
        ]),
        cache: 'no-store',
        redirect: 'error',
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(4000)])
          : AbortSignal.timeout(4000),
      });
      // No retries: an uncertain write may already have consumed a reservation.
      if (!response.ok) throw new Error('Store unavailable');
      const data = await response.json();
      const r = data?.result;
      if (
        data?.error ||
        !Array.isArray(r) ||
        r.length !== 7 ||
        ![0, 1].includes(r[0]) ||
        !r
          .slice(1, 6)
          .every(
            (n: unknown) =>
              typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
          ) ||
        r[2] <= 0 ||
        r[2] > 8640000000000000 ||
        !['ready', 'warming', 'provider', 'budget', 'pacing'].includes(r[6]) ||
        (r[0] === 1 && (r[1] !== 0 || r[3] > 2 || r[4] > 40 || r[5] > 2000))
      )
        throw new Error('Invalid tracking response');
      return {
        granted: r[0] === 1,
        retryAfterMs: r[1],
        checkedAt: new Date(r[2]).toISOString(),
        used: { second: r[3], minute: r[4], hour: r[5] },
        reason: r[6],
      };
    } catch {
      signal?.throwIfAborted();
      throw new AngelRequestError(
        'TRACKING_UNAVAILABLE',
        503,
        false,
        'Shared Angel request tracking is unavailable. No broker request was sent for this attempt.'
      );
    }
  }
  return {
    status: (signal?: AbortSignal) => execute('status', signal),
    defer: async (delay: number, signal?: AbortSignal) => {
      if (!Number.isSafeInteger(delay) || delay < 0)
        throw new AngelRequestError(
          'TRACKING_UNAVAILABLE',
          503,
          false,
          'Provider retry timing could not be tracked safely.'
        );
      if (delay > 0) await execute('pause', signal, delay);
    },
    acquire: async (signal?: AbortSignal) => {
      const started = runtime.now();
      for (let checks = 0; checks < 12; checks++) {
        signal?.throwIfAborted();
        const result = await execute('acquire', signal);
        signal?.throwIfAborted();
        if (result.granted) return;
        if (
          result.retryAfterMs > 5000 ||
          runtime.now() - started + result.retryAfterMs > 15_000 ||
          checks === 11
        ) {
          const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
          throw new AngelRequestError(
            result.reason === 'warming' ? 'TRACKING_WARMUP' : 'SHARED_LIMIT',
            429,
            false,
            result.reason === 'warming'
              ? `Shared Angel tracking is starting safely. Earlier untracked requests must clear; retry in ${seconds} seconds.`
              : `Shared Angel request allowance is waiting. Retry in ${seconds} seconds.`,
            result.retryAfterMs
          );
        }
        await runtime.pause(Math.max(50, result.retryAfterMs), signal);
      }
    },
  };
}
export const angelBudget = createAngelBudget();
