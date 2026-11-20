import type { CandleData, PriceData } from '@/contexts/AppContext';
import { getISTMinutes, istDateKey, isTradingDayIST } from './marketHours';

export const BAR_MS = 5 * 60_000;
export const MAX_QUOTE_AGE_MS = 30_000;
export const BAR_PUBLICATION_GRACE_MS = 30_000;

// Do not interpret timezone-less provider timestamps in the browser's local zone.
export function exchangeTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let input = value.trim();
  const named = /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(
    input
  );
  if (named) {
    const month = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ].indexOf(named[2].toLowerCase());
    if (month < 0) return undefined;
    input = `${named[3]}-${String(month + 1).padStart(2, '0')}-${named[1]}T${named[4]}+05:30`;
  } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(input)) {
    input = input.replace(' ', 'T') + '+05:30';
  } else if (!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(input)) {
    return undefined;
  }
  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

export function completedCandles(
  raw: CandleData[],
  now = new Date(),
  intervalMinutes = 5
): CandleData[] {
  const byTime = new Map<number, CandleData>();
  for (const candle of raw) {
    const stamp = exchangeTimestamp(candle.time);
    if (!stamp) continue;
    const time = Date.parse(stamp);
    const minutes = getISTMinutes(new Date(time));
    if (
      !isTradingDayIST(new Date(time)) ||
      minutes < 555 ||
      minutes + intervalMinutes > 930 ||
      (minutes - 555) % intervalMinutes !== 0
    )
      continue;
    if (time + intervalMinutes * 60_000 > now.getTime()) continue;
    const { open, high, low, close, volume } = candle;
    if (
      ![open, high, low, close, volume].every(Number.isFinite) ||
      Math.min(open, high, low, close) <= 0 ||
      volume < 0
    )
      continue;
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high))
      continue;
    byTime.set(time, { ...candle, time: stamp });
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([, c]) => c);
}

export function candleProblem(
  candles: CandleData[],
  now = new Date(),
  minimum = 150
): string | null {
  if (candles.length < minimum)
    return `Need ${minimum} completed bars for indicator warm-up (${candles.length} available).`;
  const latest = candles[candles.length - 1];
  if (istDateKey(new Date(latest.time)) !== istDateKey(now))
    return 'Candle data belongs to an earlier session.';
  const closeTime = Date.parse(latest.time) + BAR_MS;
  if (now.getTime() - closeTime >= BAR_MS + BAR_PUBLICATION_GRACE_MS)
    return 'Latest completed candle is stale.';
  const recent = candles.slice(-3);
  if (
    recent.some(
      (c, i) =>
        i > 0 && Date.parse(c.time) - Date.parse(recent[i - 1].time) !== BAR_MS
    )
  )
    return 'Recent candle sequence has missing bars.';
  return null;
}

export function quoteProblem(
  quote?: PriceData,
  now = new Date()
): string | null {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0)
    return 'Quote unavailable.';
  // Receipt time alone cannot establish that exchange data is current.
  const feed = Date.parse(quote.exchangeTime || '');
  const received = Date.parse(quote.lastUpdated || '');
  if (![feed, received].every(Number.isFinite))
    return 'Exchange quote timestamp unavailable.';
  if (
    now.getTime() - feed > MAX_QUOTE_AGE_MS ||
    now.getTime() - received > MAX_QUOTE_AGE_MS ||
    feed > now.getTime() + 5000 ||
    received > now.getTime() + 5000
  )
    return 'Quote is stale or its clock is invalid.';
  if (istDateKey(new Date(feed)) !== istDateKey(now))
    return 'Quote belongs to an earlier session.';
  return null;
}

export function aggregate15Minutes(candles: CandleData[]): CandleData[] {
  const groups = new Map<number, CandleData[]>();
  for (const candle of candles) {
    const time = Date.parse(candle.time);
    const bucket = time - ((getISTMinutes(new Date(time)) - 555) % 15) * 60_000;
    groups.set(bucket, [...(groups.get(bucket) || []), candle]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([time, group]) => {
      group.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
      if (
        group.length !== 3 ||
        group.some((c, i) => Date.parse(c.time) !== time + i * BAR_MS)
      )
        return [];
      return [
        {
          time: new Date(time).toISOString(),
          open: group[0].open,
          high: Math.max(...group.map((c) => c.high)),
          low: Math.min(...group.map((c) => c.low)),
          close: group[2].close,
          volume: group.reduce((n, c) => n + c.volume, 0),
        },
      ];
    });
}
