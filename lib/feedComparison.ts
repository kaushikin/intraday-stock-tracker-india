import type { CandleData } from '@/contexts/AppContext';
import {
  candleProblem,
  completedCandles,
  exchangeTimestamp,
  MAX_QUOTE_AGE_MS,
} from './marketDataQuality';
import { isIndianMarketOpen } from './marketHours';
export type ComparisonQuote = {
  price?: number;
  bid?: number;
  ask?: number;
  feedTime?: string;
  tradeTime?: string;
  receivedAt?: string;
};
export type ComparisonFeed = {
  candles: Record<string, CandleData[]>;
  quotes: Record<string, ComparisonQuote>;
  errors: Record<string, string[]>;
};
export type FeedComparison = {
  symbol: string;
  completedAt: string;
  angel: ComparisonFeed;
  upstox: ComparisonFeed;
};
export type CandleComparison = {
  status: 'UNAVAILABLE' | 'STALE' | 'NOT_ALIGNED' | 'DIFFERENT' | 'MATCH';
  message: string;
  angel?: CandleData;
  upstox?: CandleData;
  fields: ('open' | 'high' | 'low' | 'close' | 'volume')[];
};
export function compareLatestCandles(
  a: CandleData[],
  u: CandleData[],
  now: Date,
  index = false
): CandleComparison {
  const angelBars = completedCandles(a, now),
    upstoxBars = completedCandles(u, now);
  const angel = angelBars.at(-1),
    upstox = upstoxBars.at(-1);
  const fields: CandleComparison['fields'] = index
    ? ['open', 'high', 'low', 'close']
    : ['open', 'high', 'low', 'close', 'volume'];
  const base = { angel, upstox, fields };
  if (!angel || !upstox)
    return {
      ...base,
      status: 'UNAVAILABLE',
      message:
        'Both providers must supply a completed candle. No fallback or match is assumed.',
    };
  if (
    !isIndianMarketOpen(now) ||
    candleProblem(angelBars, now, 1) ||
    candleProblem(upstoxBars, now, 1)
  )
    return {
      ...base,
      status: 'STALE',
      message:
        'Historical or stale snapshot. This is not a current live comparison.',
    };
  if (angel.time !== upstox.time)
    return {
      ...base,
      status: 'NOT_ALIGNED',
      message:
        'Latest completed bar times differ. Older common bars are not substituted.',
    };
  // Round to 6 decimals only to remove numeric serialization noise, not price ticks.
  const different = fields.filter(
    (k) => Math.abs(angel[k] - upstox[k]) > 0.000001
  );
  return different.length
    ? {
        ...base,
        status: 'DIFFERENT',
        message: `Values differ: ${different.join(', ')}. Review the broker chart; do not treat this as verification passed.`,
      }
    : {
        ...base,
        status: 'MATCH',
        message:
          'Latest completed candle values match. Observation only; this does not approve a paper entry.',
      };
}
export function comparisonQuoteIssue(
  q: ComparisonQuote | undefined,
  now: Date
) {
  if (!q?.price || !Number.isFinite(q.price)) return 'Quote unavailable';
  const feed = Date.parse(q.feedTime || ''),
    receipt = Date.parse(q.receivedAt || '');
  if (!Number.isFinite(feed) || !Number.isFinite(receipt))
    return 'Provider timestamp unavailable';
  if (
    !isIndianMarketOpen(now) ||
    [feed, receipt].some(
      (t) => now.getTime() - t > MAX_QUOTE_AGE_MS || t > now.getTime() + 5000
    )
  )
    return 'Historical / stale quote';
  return 'Recent provider snapshot';
}
const empty = (): ComparisonFeed => ({ candles: {}, quotes: {}, errors: {} });
async function request(
  url: string,
  body: unknown,
  signal: AbortSignal,
  fetcher: typeof fetch
) {
  const response = await fetcher(url, {
    method: body === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]),
  });
  if (response.status === 401)
    throw new Error('App session expired. Sign in again.');
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Unreadable comparison response (HTTP ${response.status}).`
    );
  }
  if (!response.ok || !data?.success)
    throw new Error(
      String(data?.error || 'Comparison request failed.').slice(0, 250)
    );
  return data;
}
export async function fetchFeedComparison(
  symbol: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<FeedComparison> {
  if (
    !/^[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(symbol) ||
    ['NIFTY', 'BANKNIFTY'].includes(symbol)
  )
    throw new Error('Enter one Nifty 50 cash share, for example ONGC.');
  const status = await request(
    '/api/market/upstox-comparison',
    undefined,
    signal,
    fetcher
  );
  if (!status.configured)
    throw new Error('Upstox is not connected. Complete the token setup below.');
  const angel = empty(),
    upstox = empty(),
    symbols = [symbol, 'NIFTY'];
  async function stage(
    target: ComparisonFeed,
    url: string,
    body: unknown,
    kind: 'candles' | 'quotes',
    isAngel: boolean
  ) {
    try {
      const data = await request(url, body, signal, fetcher);
      for (const s of symbols) {
        if (kind === 'candles') {
          target.candles[s] = completedCandles(
            Array.isArray(data.candles?.[s]) ? data.candles[s] : []
          );
          if (!target.candles[s].length)
            target.errors[s] = [
              ...(target.errors[s] || []),
              'Completed candle not received.',
            ];
        } else {
          const matches = (
            Array.isArray(data.quotes) ? data.quotes : []
          ).filter((q: any) => q.symbol === s);
          const q = matches.length === 1 ? matches[0] : undefined;
          if (q)
            target.quotes[s] = isAngel
              ? {
                  price: q.price,
                  bid: q.bid,
                  ask: q.ask,
                  feedTime: exchangeTimestamp(q.exchangeTime),
                  tradeTime: exchangeTimestamp(q.tradeTime),
                  receivedAt: exchangeTimestamp(q.lastUpdated),
                }
              : {
                  price: q.price,
                  bid: q.bid,
                  ask: q.ask,
                  feedTime: exchangeTimestamp(q.feedTime),
                  tradeTime: exchangeTimestamp(q.tradeTime),
                  receivedAt: exchangeTimestamp(q.receivedAt),
                };
          else
            target.errors[s] = [
              ...(target.errors[s] || []),
              'Quote not received.',
            ];
        }
      }
      for (const e of Array.isArray(data.errors) ? data.errors : []) {
        const affected = symbols.includes(e.symbol) ? [e.symbol] : symbols;
        for (const s of affected) {
          target.errors[s] = [
            ...(target.errors[s] || []),
            String(e.error || e.message || 'Provider failure.').slice(0, 250),
          ];
          if (kind === 'candles') target.candles[s] = [];
          else delete target.quotes[s];
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      for (const s of symbols)
        target.errors[s] = [
          ...(target.errors[s] || []),
          error instanceof Error ? error.message : 'Feed unavailable.',
        ];
    }
  }
  // These are isolated snapshots. No scanner state, evidence or journal is updated.
  await Promise.all([
    stage(
      angel,
      '/api/market/candles',
      { symbols, interval: 'FIVE_MINUTE' },
      'candles',
      true
    ),
    stage(
      upstox,
      '/api/market/upstox-comparison',
      { symbol, kind: 'CANDLES' },
      'candles',
      false
    ),
  ]);
  signal.throwIfAborted();
  // Read both quote feeds after slow candle work, close together in time.
  await Promise.all([
    stage(
      angel,
      '/api/market/quote',
      { items: symbols.map((s) => ({ symbol: s, exchange: 'NSE', token: s })) },
      'quotes',
      true
    ),
    stage(
      upstox,
      '/api/market/upstox-comparison',
      { symbol, kind: 'QUOTES' },
      'quotes',
      false
    ),
  ]);
  signal.throwIfAborted();
  return { symbol, completedAt: new Date().toISOString(), angel, upstox };
}
