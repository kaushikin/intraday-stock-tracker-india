import type { CandleData, PriceData } from '@/contexts/AppContext';
import {
  completedCandles,
  aggregate15Minutes,
  candleProblem,
  quoteProblem,
  BAR_MS,
} from './marketDataQuality';
import { addIndicators } from './technicalIndicators';
import { isFreshSignalWindowOpenIST, istDateKey } from './marketHours';

export const STRATEGY_VERSION = 'cash-pullback-v1';
export type PaperSetup = {
  id: string;
  version: typeof STRATEGY_VERSION;
  symbol: string;
  side: 'BUY';
  barTime: string;
  createdAt: string;
  expiresAt: string;
  entry: number;
  stop: number;
  target: number;
  tickSize: number;
};
export type SetupDecision = {
  setup?: PaperSetup;
  reasons: string[];
  dataReady: boolean;
};
const round = (value: number) => Math.round(value * 10000) / 10000;
function trendSupports(candles: CandleData[]) {
  const bars = addIndicators(aggregate15Minutes(candles));
  if (bars.length < 100) return false;
  const last = bars[bars.length - 1],
    before = bars[bars.length - 4];
  return last.close > last.ema20! && last.ema20! > before.ema20!;
}

export function findPaperSetup(
  symbol: string,
  raw: CandleData[],
  indexRaw: CandleData[],
  quote: PriceData | undefined,
  now = new Date()
): SetupDecision {
  const blocked = (reason: string, dataReady = false): SetupDecision => ({
    reasons: [reason],
    dataReady,
  });
  if (!isFreshSignalWindowOpenIST(now))
    return blocked(
      'Research entries are allowed 09:45–11:15 IST on verified NSE sessions.'
    );
  const candles = completedCandles(raw, now),
    index = completedCandles(indexRaw, now);
  const stockError = candleProblem(candles, now, 300),
    indexError = candleProblem(index, now, 300),
    quoteError = quoteProblem(quote, now);
  if (stockError) return blocked(stockError);
  if (indexError) return blocked(`NIFTY: ${indexError}`);
  if (quoteError) return blocked(quoteError);
  if (candles.at(-1)!.time !== index.at(-1)!.time)
    return blocked('Stock and NIFTY completed candles are not aligned.');
  const tick = quote?.tickSize || 0;
  if (!tick || quote?.instrumentAsOf !== istDateKey(now))
    return blocked('Current cash instrument and tick size unavailable.');
  const indicators = addIndicators(candles);
  // Only the setup candle and its two-bar validity period are eligible.
  for (
    let i = indicators.length - 1;
    i >= Math.max(2, indicators.length - 2);
    i--
  ) {
    const c = indicators[i],
      a = indicators[i - 2],
      b = indicators[i - 1];
    const closesAt = Date.parse(c.time) + BAR_MS;
    if (
      now.getTime() >= closesAt + 2 * BAR_MS ||
      !isFreshSignalWindowOpenIST(new Date(closesAt))
    )
      continue;
    if (
      [a, b, c].some(
        (bar) => istDateKey(new Date(bar.time)) !== istDateKey(now)
      )
    )
      continue;
    if (
      Date.parse(c.time) - Date.parse(b.time) !== BAR_MS ||
      Date.parse(b.time) - Date.parse(a.time) !== BAR_MS
    )
      continue;
    if (
      ![a, b].every(
        (bar) =>
          bar.vwap !== undefined &&
          bar.close > bar.vwap &&
          bar.close > bar.ema20!
      )
    )
      continue;
    if (
      c.vwap === undefined ||
      c.low > c.ema20! ||
      c.close <= c.ema20! ||
      c.close <= c.vwap ||
      c.close <= c.open
    )
      continue;
    const history = candles.slice(0, i + 1),
      indexHistory = index.filter(
        (bar) => Date.parse(bar.time) + BAR_MS <= closesAt
      );
    if (!trendSupports(history) || !trendSupports(indexHistory))
      return blocked(
        'The stock and NIFTY 15-minute trends must both confirm, with 100 warm-up bars.',
        true
      );
    const entry = round((Math.floor(c.high / tick + 1e-7) + 1) * tick);
    const stop = round((Math.ceil(c.low / tick - 1e-7) - 1) * tick);
    const target = round(entry + 2 * (entry - stop));
    const session = istDateKey(now),
      previousDay = history
        .map((bar) => istDateKey(new Date(bar.time)))
        .filter((day) => day < session)
        .at(-1);
    const levels = [
      Math.max(
        ...history
          .filter((bar) => istDateKey(new Date(bar.time)) === session)
          .map((bar) => bar.high)
      ),
    ];
    if (previousDay)
      levels.push(
        Math.max(
          ...history
            .filter((bar) => istDateKey(new Date(bar.time)) === previousDay)
            .map((bar) => bar.high)
        )
      );
    if (levels.some((level) => level > entry && level < target))
      return blocked(
        'A session high obstructs the proposed 2× price-risk target.',
        true
      );
    if (
      candles.slice(i + 1).some((bar) => bar.low <= stop || bar.high >= target)
    )
      return blocked(
        'The setup has already reached an invalidation/target level. Do not enter late.',
        true
      );
    return {
      dataReady: true,
      reasons: [],
      setup: {
        id: `${STRATEGY_VERSION}:${symbol}:${c.time}`,
        version: STRATEGY_VERSION,
        symbol,
        side: 'BUY',
        barTime: c.time,
        createdAt: new Date(closesAt).toISOString(),
        expiresAt: new Date(closesAt + 2 * BAR_MS).toISOString(),
        entry,
        stop,
        target,
        tickSize: tick,
      },
    };
  }
  return blocked(
    'No completed trend-pullback setup. Waiting is a valid outcome.',
    true
  );
}
