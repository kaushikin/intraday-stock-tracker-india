import type { CandleData, PriceData } from '@/contexts/AppContext';
import type { NiftyUniverse } from './nifty50';
import { istDateKey } from './marketHours';
import { requestErrors } from './feedStatus';
export type ScannerData = {
  quotes: Record<string, PriceData>;
  candles: Record<string, CandleData[]>;
  errors: Record<string, string[]>;
  completedAt: string;
};
export type ScanProgress = {
  stage: 'CANDLES' | 'QUOTES';
  done: number;
  total: number;
};
type Runtime = {
  fetcher: typeof fetch;
  pause: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => Date;
};
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Scan cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
class ScanAuthError extends Error {}
const defaults: Runtime = {
  fetcher: (...args) => fetch(...args),
  pause,
  now: () => new Date(),
};
async function jsonRequest(
  url: string,
  body: unknown,
  signal: AbortSignal,
  runtime: Runtime
) {
  signal.throwIfAborted();
  const response = await runtime.fetcher(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]),
  });
  if (response.status === 401)
    throw new ScanAuthError('Session expired. Sign in again.');
  const data = await response.json();
  if (!response.ok || !data.success)
    throw new Error(
      data.error || `Provider request failed (HTTP ${response.status}).`
    );
  return data;
}
export async function loadScannerUniverse(
  signal: AbortSignal,
  overrides: Partial<Runtime> = {}
): Promise<NiftyUniverse> {
  const runtime = { ...defaults, ...overrides },
    data = await jsonRequest('/api/market/nifty50', undefined, signal, runtime),
    u = data.universe as NiftyUniverse;
  if (
    !u ||
    u.asOf !== istDateKey(runtime.now()) ||
    !Number.isFinite(Date.parse(u.checkedAt)) ||
    Date.parse(u.checkedAt) > runtime.now().getTime() + 5000 ||
    ![
      'https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv',
      'https://archives.nseindia.com/content/indices/ind_nifty50list.csv',
    ].includes(u.source) ||
    !Array.isArray(u.members) ||
    u.members.length !== 50 ||
    new Set(u.members.map((m) => m.symbol)).size !== 50 ||
    u.members.some(
      (m) =>
        !m ||
        !/^[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(m.symbol) ||
        typeof m.name !== 'string' ||
        !m.name
    )
  )
    throw new Error(
      'Current complete Nifty 50 membership could not be verified.'
    );
  return u;
}
export async function fetchScannerData(
  symbols: string[],
  signal: AbortSignal,
  onProgress: (p: ScanProgress) => void = () => {},
  overrides: Partial<Runtime> = {}
): Promise<ScannerData> {
  if (
    !symbols.length ||
    symbols.length > 50 ||
    new Set(symbols).size !== symbols.length ||
    symbols.some(
      (s) =>
        !/^[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(s) ||
        s === 'NIFTY' ||
        s === 'BANKNIFTY'
    )
  )
    throw new Error('Select one to fifty unique cash shares.');
  const runtime = { ...defaults, ...overrides };
  const data: ScannerData = {
    quotes: {},
    candles: {},
    errors: {},
    completedAt: '',
  };
  const addError = (symbol: string, message: string) => {
    data.errors[symbol] = [
      ...(data.errors[symbol] || []),
      message.slice(0, 250),
    ];
  };
  // Bounded, sequential requests avoid the old >20-symbol request and long serverless jobs.
  for (let offset = 0; offset < symbols.length; offset += 4) {
    signal.throwIfAborted();
    const shares = symbols.slice(offset, offset + 4),
      batch = [...shares, 'NIFTY'];
    try {
      const result = await jsonRequest(
        '/api/market/candles',
        { symbols: batch, interval: 'FIVE_MINUTE' },
        signal,
        runtime
      );
      for (const s of shares)
        data.candles[s] = Array.isArray(result.candles?.[s])
          ? result.candles[s]
          : [];
      data.candles.NIFTY = Array.isArray(result.candles?.NIFTY)
        ? result.candles.NIFTY
        : [];
      delete data.errors.NIFTY;
      const errors = requestErrors(
        result,
        batch,
        batch.filter(
          (s) => Array.isArray(result.candles?.[s]) && result.candles[s].length
        )
      );
      for (const e of errors) {
        if (batch.includes(e.symbol)) {
          data.candles[e.symbol] = [];
          addError(e.symbol, e.message);
        } else
          for (const s of batch) {
            data.candles[s] = [];
            addError(s, e.message);
          }
      }
    } catch (e) {
      signal.throwIfAborted();
      if (e instanceof ScanAuthError) throw e;
      const message = e instanceof Error ? e.message : 'Candle fetch failed.';
      for (const s of batch) {
        data.candles[s] = [];
        data.errors[s] = [message];
      }
    }
    onProgress({
      stage: 'CANDLES',
      done: Math.min(offset + 4, symbols.length),
      total: symbols.length,
    });
    await runtime.pause(1100, signal);
  }
  // Get quotes last: candle loading can take over a minute, so initial quotes would be stale.
  for (let offset = 0; offset < symbols.length; offset += 15) {
    signal.throwIfAborted();
    const batch = symbols.slice(offset, offset + 15);
    try {
      const result = await jsonRequest(
        '/api/market/quote',
        {
          items: batch.map((symbol) => ({
            symbol,
            exchange: 'NSE',
            token: symbol,
          })),
        },
        signal,
        runtime
      );
      const returned = (
        Array.isArray(result.quotes) ? result.quotes : []
      ).filter((q: any) => batch.includes(q.symbol));
      for (const q of returned)
        data.quotes[q.symbol] = {
          price: Number(q.price),
          change: Number(q.changePercent),
          ask: Number(q.ask),
          bid: Number(q.bid),
          askQuantity: Number(q.askQuantity),
          tickSize: Number(q.tickSize),
          instrumentAsOf: q.instrumentAsOf,
          exchangeTime: q.exchangeTime,
          lastUpdated: q.lastUpdated,
        };
      for (const e of requestErrors(
        result,
        batch,
        returned.map((q: any) => q.symbol)
      )) {
        const affected = batch.includes(e.symbol) ? [e.symbol] : batch;
        for (const s of affected) {
          delete data.quotes[s];
          addError(s, e.message);
        }
      }
    } catch (e) {
      signal.throwIfAborted();
      if (e instanceof ScanAuthError) throw e;
      for (const s of batch)
        addError(s, e instanceof Error ? e.message : 'Quote fetch failed.');
    }
    onProgress({
      stage: 'QUOTES',
      done: Math.min(offset + 15, symbols.length),
      total: symbols.length,
    });
    if (offset + 15 < symbols.length) await runtime.pause(1100, signal);
  }
  signal.throwIfAborted();
  data.completedAt = runtime.now().toISOString();
  return data;
}

// Open-position supervision needs fresh quotes without repeating all candle history.
export async function fetchScannerQuote(
  symbol: string,
  signal: AbortSignal,
  overrides: Partial<Runtime> = {}
): Promise<PriceData> {
  if (
    !/^[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(symbol) ||
    ['NIFTY', 'BANKNIFTY'].includes(symbol)
  )
    throw new Error('Invalid cash share.');
  const result = await jsonRequest(
    '/api/market/quote',
    { items: [{ symbol, exchange: 'NSE', token: symbol }] },
    signal,
    { ...defaults, ...overrides }
  );
  const q = Array.isArray(result.quotes)
    ? result.quotes.find((q: any) => q.symbol === symbol)
    : undefined;
  const errors = requestErrors(result, [symbol], q ? [symbol] : []);
  if (errors.length || !q)
    throw new Error(errors.map((e) => e.message).join(' ') || 'Quote missing.');
  return {
    price: Number(q.price),
    change: Number(q.changePercent),
    ask: Number(q.ask),
    bid: Number(q.bid),
    askQuantity: Number(q.askQuantity),
    tickSize: Number(q.tickSize),
    instrumentAsOf: q.instrumentAsOf,
    exchangeTime: q.exchangeTime,
    lastUpdated: q.lastUpdated,
  };
}
