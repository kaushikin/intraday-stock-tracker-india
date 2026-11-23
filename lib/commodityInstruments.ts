// Server-only current MCX contracts; never fall back to the legacy hard-coded tokens.
import { istDateKey } from './marketHours';
import { parseCommodityMaster, type CommodityContract } from './commodityWatch';
export const COMMODITY_MASTER_URL =
  'https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json';
let cache: { date: string; contracts: CommodityContract[] } | undefined;
let pending: { date: string; result: Promise<CommodityContract[]> } | undefined;
export async function getCommodityContracts() {
  const date = istDateKey();
  if (cache?.date === date) return cache.contracts;
  if (pending?.date === date) return pending.result;
  const result = (async () => {
    const response = await fetch(COMMODITY_MASTER_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    if (!response.ok)
      throw new Error(
        'Current commodity instrument list unavailable. Refresh later.'
      );
    const contracts = parseCommodityMaster(await response.json(), date);
    if (!contracts.length)
      throw new Error(
        'No supported current commodity futures in Angel’s instrument list.'
      );
    cache = { date, contracts };
    return contracts;
  })();
  pending = { date, result };
  try {
    return await result;
  } finally {
    if (pending?.result === result) pending = undefined;
  }
}
