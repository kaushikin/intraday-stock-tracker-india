import { exchangeTimestamp } from './marketDataQuality';
import { getISTMinutes, istDateKey, isWeekendIST } from './marketHours';

export const GOLD_PETAL_SPEC =
  'https://www.mcxindia.com/docs/default-source/about-us/gold-petal-july-2026-contract-onwards.pdf';
export const MCX_CALENDAR =
  'https://www.mcxindia.com/market-operations/trading-surveillance/trading-holidays';
const fullClosed = new Set([
  '2026-01-01',
  '2026-01-26',
  '2026-04-03',
  '2026-10-02',
  '2026-12-25',
]);
const morningClosed = new Set([
  '2026-03-03',
  '2026-03-26',
  '2026-03-31',
  '2026-04-14',
  '2026-05-01',
  '2026-05-28',
  '2026-06-26',
  '2026-09-14',
  '2026-10-20',
  '2026-11-10',
  '2026-11-24',
]);
export const PETAL_BAR_MS = 300000;
export type PetalContract = {
  symbol: string;
  token: string;
  expiry: string;
  lot: 1;
  tick: 1;
  exchange: 'MCX';
};
export type PetalBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type PetalQuote = {
  price: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  exchangeTime: string;
  tradeTime: string;
  receivedAt: string;
};
export type PetalFeed = {
  kind: 'GOLD_PETAL_PAPER';
  checkedAt: string;
  contract?: PetalContract;
  quote?: PetalQuote;
  candles: PetalBar[];
  errors: string[];
  retryAfterMs?: number;
};
const months = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];
export function petalContracts(rows: unknown): PetalContract[] {
  if (!Array.isArray(rows)) throw new Error('Instrument master is unreadable.');
  const found: PetalContract[] = [];
  for (const r of rows) {
    if (
      r?.name !== 'GOLDPETAL' ||
      r.exch_seg !== 'MCX' ||
      r.instrumenttype !== 'FUTCOM'
    )
      continue;
    const m = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(r.expiry);
    if (!m || !months.includes(m[2])) continue;
    const expiry = `${m[3]}-${String(months.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1]}`;
    if (
      !Number.isFinite(Date.parse(expiry)) ||
      new Date(expiry).toISOString().slice(0, 10) !== expiry
    )
      continue;
    const symbol = `GOLDPETAL${m[1]}${m[2]}${m[3].slice(2)}FUT`;
    if (
      r.symbol !== symbol ||
      !/^\d+$/.test(String(r.token)) ||
      Number(r.lotsize) !== 1 ||
      Number(r.tick_size) !== 100
    )
      continue;
    const existing = found.find((c) => c.symbol === symbol);
    if (existing && existing.token !== String(r.token))
      throw new Error('Conflicting Gold Petal contract identifiers.');
    if (!existing)
      found.push({
        symbol,
        token: String(r.token),
        expiry,
        lot: 1,
        tick: 1,
        exchange: 'MCX',
      });
  }
  return found.sort((a, b) => a.expiry.localeCompare(b.expiry));
}
export function petalContractProblem(
  c: PetalContract,
  now: Date
): string | null {
  if (
    !/^GOLDPETAL\d{2}[A-Z]{3}\d{2}FUT$/.test(c.symbol) ||
    !/^\d+$/.test(c.token) ||
    c.lot !== 1 ||
    c.tick !== 1 ||
    c.exchange !== 'MCX'
  )
    return 'Unsupported Gold Petal contract.';
  const expiry = Date.parse(c.expiry + 'T00:00:00+05:30');
  if (
    !Number.isFinite(expiry) ||
    c.expiry > '2026-12-31' ||
    c.expiry < '2026-07-01'
  )
    return 'Contract specification review is required for this expiry.';
  if (expiry - Date.parse(istDateKey(now) + 'T00:00:00+05:30') <= 10 * 86400000)
    return 'No entries within 10 calendar days of expiry; verify tender dates with Angel.';
  return null;
}
export function selectPetalContract(
  contracts: PetalContract[],
  now: Date,
  symbol?: string
) {
  // An open position always requests its saved symbol. Never silently roll an exit.
  const selected = symbol
    ? contracts.find((c) => c.symbol === symbol)
    : contracts.find((c) => !petalContractProblem(c, now));
  if (!selected)
    throw new Error(
      'No supported Gold Petal contract is available for this request.'
    );
  return selected;
}
export function petalSessionProblem(now: Date): string | null {
  const day = istDateKey(now),
    minute = getISTMinutes(now);
  if (!day.startsWith('2026-'))
    return 'MCX calendar review required for this year.';
  if (isWeekendIST(now) || fullClosed.has(day))
    return 'No pilot entries in this MCX evening session.';
  if (minute < 18 * 60 || minute >= 21 * 60 + 30)
    return 'Pilot entry window: 18:00–21:30 IST; this is a research rule, not the MCX closing time.';
  return null;
}
export function parsePetalQuote(
  payload: any,
  c: PetalContract,
  receivedAt: string
): PetalQuote {
  const rows = payload?.data?.fetched;
  const matches = Array.isArray(rows)
    ? rows.filter(
        (r) =>
          r.exchange === 'MCX' &&
          r.tradingSymbol === c.symbol &&
          String(r.symbolToken) === c.token
      )
    : [];
  if (matches.length !== 1)
    throw new Error(
      'Quote does not uniquely match the selected Gold Petal expiry.'
    );
  const q = matches[0];
  const buy = q.depth?.buy?.[0],
    sell = q.depth?.sell?.[0];
  const nums = [
    q.ltp,
    buy?.price,
    sell?.price,
    buy?.quantity,
    sell?.quantity,
  ].map(Number);
  if (
    nums.some((n) => !Number.isFinite(n) || n <= 0) ||
    nums.slice(0, 3).some((n) => !Number.isInteger(n)) ||
    nums[1] > nums[2]
  )
    throw new Error('Gold Petal bid/ask depth is missing, crossed or invalid.');
  const stamps = [q.exchFeedTime, q.exchTradeTime, receivedAt].map(
    exchangeTimestamp
  );
  if (stamps.some((s) => !s))
    throw new Error('Gold Petal exchange or trade timestamp is missing.');
  return {
    price: nums[0],
    bid: nums[1],
    ask: nums[2],
    bidQty: nums[3],
    askQty: nums[4],
    exchangeTime: stamps[0]!,
    tradeTime: stamps[1]!,
    receivedAt: stamps[2]!,
  };
}
export function petalQuoteProblem(
  q: PetalQuote | undefined,
  now: Date
): string | null {
  if (
    !q ||
    [q.price, q.bid, q.ask, q.bidQty, q.askQty].some(
      (n) => !Number.isFinite(n) || n <= 0
    ) ||
    q.bid > q.ask
  )
    return 'Fresh executable bid/ask data is unavailable.';
  const times = [q.exchangeTime, q.tradeTime, q.receivedAt].map(Date.parse);
  if (
    times.some(
      (t) =>
        !Number.isFinite(t) ||
        t > now.getTime() + 5000 ||
        now.getTime() - t > 30000
    ) ||
    times.some((t) => istDateKey(new Date(t)) !== istDateKey(now))
  )
    return 'Quote is stale or its timestamps disagree. Refresh and verify again.';
  return null;
}
export function parsePetalCandles(raw: unknown, now: Date): PetalBar[] {
  if (!Array.isArray(raw))
    throw new Error('Gold Petal candle response is unreadable.');
  const byTime = new Map<string, PetalBar>();
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6)
      throw new Error('Malformed Gold Petal candle row.');
    const time = exchangeTimestamp(row[0]);
    if (!time) throw new Error('Candle timestamp is missing or invalid.');
    const stamp = Date.parse(time),
      day = istDateKey(new Date(stamp)),
      minute = getISTMinutes(new Date(stamp));
    if (stamp + PETAL_BAR_MS > now.getTime()) continue; // Never use the forming bar.
    if (day !== istDateKey(now)) continue;
    if (
      isWeekendIST(new Date(stamp)) ||
      fullClosed.has(day) ||
      minute < (morningClosed.has(day) ? 1020 : 540) ||
      minute >= 1380 ||
      minute % 5 !== 0 ||
      stamp % 60000 !== 0
    )
      continue;
    const [open, high, low, close, volume] = row.slice(1, 6).map(Number);
    if (
      [open, high, low, close].some((n) => !Number.isInteger(n) || n <= 0) ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      high < Math.max(open, low, close) ||
      low > Math.min(open, high, close)
    )
      throw new Error('Invalid Gold Petal OHLC or volume.');
    const bar = { time, open, high, low, close, volume };
    if (
      byTime.has(time) &&
      JSON.stringify(byTime.get(time)) !== JSON.stringify(bar)
    )
      throw new Error('Conflicting Gold Petal candles.');
    byTime.set(time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}
export function petalCandleProblem(bars: PetalBar[], now: Date): string | null {
  if (bars.length < 50)
    return `Need 50 completed same-session MCX bars (${bars.length} available).`;
  const recent = bars.slice(-50),
    latest = recent[49];
  const end = Date.parse(latest.time) + PETAL_BAR_MS;
  if (
    istDateKey(new Date(latest.time)) !== istDateKey(now) ||
    end > now.getTime() ||
    now.getTime() - end >= PETAL_BAR_MS + 30000
  )
    return 'Latest completed MCX candle is stale or invalid.';
  if (
    recent.some(
      (b, i) =>
        i > 0 &&
        Date.parse(b.time) - Date.parse(recent[i - 1].time) !== PETAL_BAR_MS
    )
  )
    return 'The last 50 MCX candles contain a gap.';
  return null;
}
