import { INSTRUMENTS } from './instruments';
import { istDateKey } from './marketHours';

export type CashInstrument = {
  symbol: string;
  tradingSymbol: string;
  token: string;
  exchange: 'NSE';
  tickSize: number;
  asOf: string;
};
const MASTER_URL =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
let cache: { date: string; values: Record<string, CashInstrument> } | undefined;
let pending: Promise<Record<string, CashInstrument>> | undefined;

export function parseCashMaster(
  rows: unknown,
  date: string
): Record<string, CashInstrument> {
  if (!Array.isArray(rows))
    throw new Error('Instrument master is not an array.');
  const result: Record<string, CashInstrument> = {};
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const symbol = String(row.name || '');
    if (
      !INSTRUMENTS[symbol] ||
      row.exch_seg !== 'NSE' ||
      row.symbol !== `${symbol}-EQ` ||
      row.expiry ||
      Number(row.lotsize) !== 1
    )
      continue;
    // Angel's NSE cash tick_size is expressed in paise (not the currency/derivative convention).
    const tick = Number(row.tick_size) / 100;
    if (!Number.isFinite(tick) || tick <= 0 || !/^\d+$/.test(String(row.token)))
      continue;
    result[symbol] = {
      symbol,
      tradingSymbol: row.symbol,
      token: String(row.token),
      exchange: 'NSE',
      tickSize: tick,
      asOf: date,
    };
  }
  if (!Object.keys(result).length)
    throw new Error('No supported cash shares in instrument master.');
  for (const symbol of ['NIFTY', 'BANKNIFTY']) {
    result[symbol] = {
      ...INSTRUMENTS[symbol],
      exchange: 'NSE',
      tickSize: 0,
      asOf: date,
    };
  }
  return result;
}

export async function getCashInstruments(): Promise<
  Record<string, CashInstrument>
> {
  const date = istDateKey();
  if (cache?.date === date) return cache.values;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch(MASTER_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(
        'Current instrument master unavailable. New setups are blocked.'
      );
    const values = parseCashMaster(await response.json(), date);
    cache = { date, values };
    return values;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
