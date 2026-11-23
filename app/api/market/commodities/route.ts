import { NextRequest, NextResponse } from 'next/server';
import { getAngelMarketData } from '@/lib/angel';
import { AngelRequestError } from '@/lib/angelErrors';
import { getCommodityContracts } from '@/lib/commodityInstruments';
import {
  COMMODITY_WATCH,
  commodityObservations,
  type CommodityContract,
  type CommodityWatchResponse,
} from '@/lib/commodityWatch';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// No client-supplied tokens, symbols, positions or orders. One manual batched MCX read.
export async function POST(req: NextRequest) {
  const deadline = AbortSignal.any([req.signal, AbortSignal.timeout(45000)]);
  let contracts: CommodityContract[] = [];
  try {
    contracts = await getCommodityContracts();
    deadline.throwIfAborted();
    const data = await getAngelMarketData(
      { MCX: contracts.map((c) => c.token) },
      deadline
    );
    const checkedAt = new Date().toISOString();
    const observations = commodityObservations(data, contracts, checkedAt);
    const result: CommodityWatchResponse = {
      success: observations.some((o) => o.price !== undefined),
      purpose: 'watch-only',
      checkedAt,
      observations,
    };
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const known = error instanceof AngelRequestError;
    const message = known
      ? error.message
      : contracts.length
        ? 'Commodity quote request failed or timed out. Refresh later.'
        : 'Current commodity contract list unavailable. Refresh later.';
    const result: CommodityWatchResponse = {
      success: false,
      purpose: 'watch-only',
      checkedAt: new Date().toISOString(),
      error: message,
      retryAfterMs: known ? error.retryAfterMs : 0,
      observations: COMMODITY_WATCH.map(({ symbol }) => ({
        symbol,
        contract: contracts.find((c) => c.symbol === symbol),
        error: message,
      })),
    };
    return NextResponse.json(result, {
      status: known && error.httpStatus === 429 ? 429 : 503,
      headers: {
        'Cache-Control': 'private, no-store',
        ...(known && error.retryAfterMs > 0
          ? {
              'Retry-After': String(
                Math.max(1, Math.ceil(error.retryAfterMs / 1000))
              ),
            }
          : {}),
      },
    });
  }
}
