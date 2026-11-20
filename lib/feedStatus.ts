import type { CandleData, PriceData } from '@/contexts/AppContext';
import { isIndianMarketOpen } from './marketHours';
import {
  candleProblem,
  completedCandles,
  quoteProblem,
} from './marketDataQuality';

export type FeedRequestState = {
  state: 'IDLE' | 'LOADING' | 'OK' | 'PARTIAL' | 'ERROR';
  attemptedAt?: string;
  receivedAt?: string;
  errors: { symbol: string; message: string }[];
};
export const idleFeed = (): FeedRequestState => ({ state: 'IDLE', errors: [] });
export function describeQuote(quote: PriceData | undefined, now: Date) {
  const problem = quoteProblem(quote, now);
  if (!quote?.exchangeTime || !quote.price)
    return {
      label: 'Unavailable',
      detail: problem || 'Exchange timestamp missing.',
      healthy: false,
    };
  if (!isIndianMarketOpen(now))
    return {
      label: 'Session closed',
      detail:
        'Snapshot only. Fresh-entry checks are disabled outside the regular session.',
      healthy: false,
    };
  if (problem)
    return { label: 'Stale / invalid', detail: problem, healthy: false };
  const depth =
    Number(quote.ask) > 0 &&
    Number(quote.bid) > 0 &&
    Number(quote.askQuantity) > 0;
  return {
    label: depth ? 'Current' : 'Depth unavailable',
    detail: depth
      ? 'Exchange and receipt timestamps are within 30 seconds.'
      : 'Quote received, but executable bid/ask or ask depth is missing.',
    healthy: depth,
  };
}
export function describeCandles(raw: CandleData[], now: Date) {
  const bars = completedCandles(raw, now),
    latest = bars.at(-1);
  if (!latest)
    return {
      label: 'Unavailable',
      detail: 'No completed bars received.',
      bars,
      healthy: false,
    };
  if (!isIndianMarketOpen(now))
    return {
      label: 'Session closed',
      detail: 'Historical completed bars; not evidence of a current live feed.',
      bars,
      healthy: false,
    };
  const problem = candleProblem(bars, now, 300);
  return {
    label: problem
      ? /stale|earlier session/i.test(problem)
        ? 'Stale'
        : 'Not ready'
      : 'Current',
    detail: problem || 'Completed bars are current with sufficient warm-up.',
    bars,
    healthy: !problem,
  };
}
export function requestErrors(
  data: any,
  symbols: string[],
  returned: string[]
): FeedRequestState['errors'] {
  const errors: FeedRequestState['errors'] = [];
  for (const error of Array.isArray(data?.errors) ? data.errors : []) {
    for (const symbol of Array.isArray(error.symbols)
      ? error.symbols
      : [error.symbol || 'ALL'])
      errors.push({
        symbol: String(symbol),
        message: String(
          error.error || error.message || 'Provider did not return data'
        ).slice(0, 250),
      });
  }
  for (const symbol of symbols)
    if (!returned.includes(symbol) && !errors.some((e) => e.symbol === symbol))
      errors.push({
        symbol,
        message: 'Provider returned no data for this symbol.',
      });
  return errors;
}
