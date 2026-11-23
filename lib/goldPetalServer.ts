import { getAngelCandleData, getAngelMarketData } from './angel';
import { AngelRequestError } from './angelErrors';
import { COMMODITY_MASTER_URL } from './commodityInstruments';
import { istDateKey } from './marketHours';
import {
  petalContracts,
  selectPetalContract,
  parsePetalCandles,
  parsePetalQuote,
  type PetalContract,
  type PetalFeed,
} from './goldPetalMarket';
let cached: { day: string; contracts: PetalContract[] } | undefined;
let pending: Promise<PetalContract[]> | undefined;
export async function getPetalContracts() {
  const day = istDateKey();
  if (cached?.day === day) return cached.contracts;
  if (pending) return pending;
  pending = (async () => {
    const r = await fetch(COMMODITY_MASTER_URL, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error('Gold Petal instrument master unavailable.');
    const contracts = petalContracts(await r.json());
    if (!contracts.length)
      throw new Error('No supported Gold Petal futures in the current master.');
    cached = { day, contracts };
    return contracts;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
export async function loadPetalFeed(
  signal: AbortSignal,
  symbol?: string
): Promise<PetalFeed> {
  const now = new Date(),
    day = istDateKey(now);
  const result: PetalFeed = {
    kind: 'GOLD_PETAL_PAPER',
    checkedAt: now.toISOString(),
    candles: [],
    errors: [],
  };
  const failure = (e: unknown, fallback: string) => {
    result.errors.push(e instanceof AngelRequestError ? e.message : fallback);
    if (e instanceof AngelRequestError)
      result.retryAfterMs = Math.max(result.retryAfterMs || 0, e.retryAfterMs);
  };
  try {
    result.contract = selectPetalContract(
      await getPetalContracts(),
      now,
      symbol
    );
  } catch {
    result.errors.push(
      'Current Gold Petal contract unavailable; no token fallback is used.'
    );
    return result;
  }
  const c = result.contract;
  // MCX-only dates. Never reuse NSE candle normalisation or its 15:30 close.
  try {
    const to = new Date(now.getTime() + 330 * 60000)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');
    const candles = await getAngelCandleData(
      {
        exchange: 'MCX',
        symboltoken: c.token,
        interval: 'FIVE_MINUTE',
        fromdate: day + ' 09:00',
        todate: to,
      },
      AbortSignal.any([signal, AbortSignal.timeout(16000)])
    );
    result.candles = parsePetalCandles(candles.data, new Date());
  } catch (e) {
    failure(e, 'Gold Petal completed candles unavailable or malformed.');
  }
  // Still try the quote after candle failure so an open paper position can be reviewed.
  try {
    signal.throwIfAborted();
    const q = await getAngelMarketData(
      { MCX: [c.token] },
      AbortSignal.any([signal, AbortSignal.timeout(16000)])
    );
    result.quote = parsePetalQuote(q, c, new Date().toISOString());
  } catch (e) {
    failure(e, 'Gold Petal quote/depth unavailable or malformed.');
  }
  result.checkedAt = new Date().toISOString();
  return result;
}
