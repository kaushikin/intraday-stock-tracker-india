import { exchangeTimestamp } from './marketDataQuality';
export const COMMODITY_WATCH = [
  {
    symbol: 'CRUDEOIL',
    name: 'Crude oil',
    quoteUnit: 'per barrel',
    link: 'https://www.mcxindia.com/products/energy/crude-oil',
  },
  {
    symbol: 'COPPER',
    name: 'Copper',
    quoteUnit: 'per kg',
    link: 'https://www.mcxindia.com/products/metals/copper',
  },
  {
    symbol: 'GOLD',
    name: 'Gold',
    quoteUnit: 'per 10 grams',
    link: 'https://www.mcxindia.com/products/bullion/gold',
  },
] as const;
export type CommoditySymbol = (typeof COMMODITY_WATCH)[number]['symbol'];
export type CommodityContract = {
  symbol: CommoditySymbol;
  tradingSymbol: string;
  token: string;
  exchange: 'MCX';
  expiry: string;
  asOf: string;
};
export type CommodityObservation = {
  symbol: CommoditySymbol;
  contract?: CommodityContract;
  price?: number;
  changePercent?: number;
  exchangeTime?: string;
  tradeTime?: string;
  receivedAt?: string;
  error?: string;
};
export type CommodityWatchResponse = {
  success: boolean;
  purpose: 'watch-only';
  checkedAt: string;
  observations: CommodityObservation[];
  error?: string;
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
function expiryDate(raw: unknown) {
  const m = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(String(raw));
  if (!m || !months.includes(m[2])) return undefined;
  const iso = `${m[3]}-${String(months.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1]}`;
  const parsed = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === iso
    ? iso
    : undefined;
}
export function parseCommodityMaster(
  rows: unknown,
  today: string
): CommodityContract[] {
  if (!Array.isArray(rows))
    throw new Error('Commodity instrument list is unreadable.');
  const contracts: CommodityContract[] = [];
  for (const item of COMMODITY_WATCH) {
    const candidates = rows
      .filter(
        (r) =>
          r?.exch_seg === 'MCX' &&
          r.name === item.symbol &&
          r.instrumenttype === 'FUTCOM'
      )
      .flatMap((r) => {
        const expiry = expiryDate(r.expiry);
        if (
          !expiry ||
          expiry <= today ||
          !/^\d+$/.test(String(r.token)) ||
          !Number.isSafeInteger(Number(r.lotsize)) ||
          Number(r.lotsize) <= 0
        )
          return [];
        const expected =
          item.symbol +
          String(r.expiry).slice(0, 5) +
          String(r.expiry).slice(-2) +
          'FUT';
        if (r.symbol !== expected) return [];
        return [
          {
            symbol: item.symbol,
            tradingSymbol: expected,
            token: String(r.token),
            exchange: 'MCX' as const,
            expiry,
            asOf: today,
          },
        ];
      })
      .sort((a, b) => a.expiry.localeCompare(b.expiry));
    if (!candidates.length) continue;
    const first = candidates[0];
    if (
      candidates.some(
        (c) => c.expiry === first.expiry && c.token !== first.token
      )
    )
      throw new Error(
        'Conflicting commodity contract identifiers. Verify the instrument list before refreshing.'
      );
    contracts.push(first);
  }
  return contracts;
}
export function commodityObservations(
  payload: any,
  contracts: CommodityContract[],
  receivedAt: string
): CommodityObservation[] {
  const rows = Array.isArray(payload?.data?.fetched)
    ? payload.data.fetched
    : [];
  return COMMODITY_WATCH.map(({ symbol }) => {
    const contract = contracts.find((c) => c.symbol === symbol);
    if (!contract)
      return {
        symbol,
        error: 'No supported current MCX futures contract found.',
      };
    const matches = rows.filter(
      (r: any) =>
        String(r?.symbolToken) === contract.token &&
        r.exchange === 'MCX' &&
        r.tradingSymbol === contract.tradingSymbol
    );
    if (
      matches.length !== 1 ||
      !Number.isFinite(Number(matches[0]?.ltp)) ||
      Number(matches[0]?.ltp) <= 0
    )
      return {
        symbol,
        contract,
        error:
          'Angel did not return one valid quote for this exact contract. Check MCX data access in Angel One.',
      };
    const q = matches[0],
      change = q.percentChange;
    return {
      symbol,
      contract,
      price: Number(q.ltp),
      changePercent:
        change !== null &&
        change !== undefined &&
        change !== '' &&
        Number.isFinite(Number(change))
          ? Number(change)
          : undefined,
      exchangeTime: exchangeTimestamp(q.exchFeedTime),
      tradeTime: exchangeTimestamp(q.exchTradeTime),
      receivedAt,
    };
  });
}
export function commodityQuoteStatus(item: CommodityObservation, now: number) {
  if (item.error || !item.price) return item.error || 'Not checked';
  const stamps = [item.exchangeTime, item.tradeTime, item.receivedAt].map((s) =>
    Date.parse(s || '')
  );
  if (stamps.some((t) => !Number.isFinite(t)))
    return 'Timestamp missing · freshness unverified';
  if (stamps.some((t) => t > now + 5000))
    return 'Timestamp mismatch · verify with Angel';
  if (stamps.some((t) => now - t > 30000))
    return 'Stale snapshot · refresh to check';
  return 'Recent timestamps · verify with Angel';
}
