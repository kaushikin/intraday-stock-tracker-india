// Server-side, read-only adapter. Do not import this module into a client component.
import { completedCandles, exchangeTimestamp } from './marketDataQuality';
import type { ComparisonQuote } from './feedComparison';

export class UpstoxComparisonError extends Error {
  constructor(
    public code: string,
    message: string,
    public providerStatus?: number
  ) {
    super(message);
  }
}
export function upstoxConfigured() {
  return Boolean(process.env.UPSTOX_ANALYTICS_TOKEN?.trim());
}
export function upstoxTime(value: unknown): string | undefined {
  if (
    typeof value === 'number' ||
    (typeof value === 'string' && /^\d{13}$/.test(value))
  ) {
    const ms = Number(value);
    return Number.isFinite(ms) && ms > 0 && ms < 8640000000000000
      ? new Date(ms).toISOString()
      : undefined;
  }
  return exchangeTimestamp(value);
}
let blockedUntil = 0;
async function read(path: string, signal: AbortSignal) {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN?.trim();
  if (!token)
    throw new UpstoxComparisonError(
      'NOT_CONFIGURED',
      'Upstox is not connected. Complete the token setup below.'
    );
  if (Date.now() < blockedUntil)
    throw new UpstoxComparisonError(
      'RATE_LIMIT',
      'Upstox requested a cooldown. Wait before comparing again.',
      429
    );
  let response: Response;
  try {
    response = await fetch(`https://api.upstox.com${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
  } catch {
    throw new UpstoxComparisonError(
      'NETWORK',
      'Upstox request failed or timed out. No replacement data was used.'
    );
  }
  if (response.status === 429) {
    const retry = response.headers.get('retry-after');
    const delay =
      retry && /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : Date.parse(retry || '') - Date.now();
    blockedUntil =
      Date.now() + Math.max(30_000, Number.isFinite(delay) ? delay : 0);
    throw new UpstoxComparisonError(
      'RATE_LIMIT',
      'Upstox rate limit. Wait before comparing again (HTTP 429).',
      429
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new UpstoxComparisonError(
      'AUTH',
      `Upstox token was rejected or lacks access (HTTP ${response.status}). Check the Analytics Token in Vercel and redeploy.`,
      response.status
    );
  if (!response.ok)
    throw new UpstoxComparisonError(
      'PROVIDER',
      `Upstox comparison data unavailable (HTTP ${response.status}).`,
      response.status
    );
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new UpstoxComparisonError(
      'FORMAT',
      'Upstox returned an unreadable response.'
    );
  }
  if (data?.status !== 'success' || !data.data || typeof data.data !== 'object')
    throw new UpstoxComparisonError(
      'FORMAT',
      'Upstox did not return usable comparison data.'
    );
  // Never expose raw provider errors, request headers, or credential-bearing responses.
  return data.data;
}
function positive(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
export async function readUpstoxCandles(key: string, signal: AbortSignal) {
  const data = await read(
    `/v3/historical-candle/intraday/${encodeURIComponent(key)}/minutes/5`,
    signal
  );
  if (!Array.isArray(data.candles))
    throw new UpstoxComparisonError(
      'FORMAT',
      'Upstox candle series is missing.'
    );
  const seen = new Map<string, string>();
  const candles = completedCandles(
    data.candles.map((r: any) => {
      const stamp = Array.isArray(r) ? exchangeTimestamp(r[0]) : undefined;
      if (
        !stamp ||
        r.length < 6 ||
        !r
          .slice(1, 6)
          .every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) ||
        Math.min(r[1], r[2], r[3], r[4]) <= 0 ||
        r[5] < 0 ||
        r[2] < Math.max(r[1], r[3], r[4]) ||
        r[3] > Math.min(r[1], r[2], r[4])
      )
        throw new UpstoxComparisonError(
          'FORMAT',
          'Upstox returned an invalid candle. No match was assumed.'
        );
      const values = JSON.stringify(r.slice(1, 6));
      if (seen.has(stamp) && seen.get(stamp) !== values)
        throw new UpstoxComparisonError(
          'FORMAT',
          'Upstox returned conflicting candles for the same timestamp.'
        );
      seen.set(stamp, values);
      return {
        time: stamp,
        open: r[1],
        high: r[2],
        low: r[3],
        close: r[4],
        volume: r[5],
      };
    })
  );
  if (!candles.length)
    throw new UpstoxComparisonError(
      'NO_CANDLES',
      'Upstox has no usable completed five-minute candles for today.'
    );
  return candles;
}
export async function readUpstoxQuotes(
  keys: Record<string, string>,
  signal: AbortSignal
) {
  const data = await read(
    `/v2/market-quote/quotes?instrument_key=${encodeURIComponent(Object.values(keys).join(','))}`,
    signal
  );
  const receivedAt = new Date().toISOString();
  return Object.entries(keys).map(([symbol, key]) => {
    const matches = Object.values(data).filter(
      (q: any) => q?.instrument_token === key
    ) as any[];
    const q = matches.length === 1 ? matches[0] : undefined;
    if (!q || !positive(q.last_price))
      return {
        symbol,
        error: 'Upstox quote missing or instrument identity did not match.',
      };
    const quote: ComparisonQuote = {
      price: positive(q.last_price),
      bid: positive(q.depth?.buy?.[0]?.price),
      ask: positive(q.depth?.sell?.[0]?.price),
      feedTime: upstoxTime(q.timestamp),
      tradeTime: upstoxTime(q.last_trade_time),
      receivedAt,
    };
    return { symbol, ...quote };
  });
}
