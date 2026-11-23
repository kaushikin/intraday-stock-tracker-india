import { NextRequest, NextResponse } from 'next/server';
import { getNifty50Universe } from '@/lib/nifty50';
import {
  readUpstoxCandles,
  readUpstoxQuotes,
  upstoxConfigured,
  UpstoxComparisonError,
} from '@/lib/upstoxComparison';
import type { CandleData } from '@/contexts/AppContext';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store' };
const purpose = 'verification-only';
export async function GET() {
  return NextResponse.json(
    { success: true, configured: upstoxConfigured(), purpose },
    { headers }
  );
}
export async function POST(req: NextRequest) {
  if (!upstoxConfigured())
    return NextResponse.json(
      {
        success: false,
        code: 'NOT_CONFIGURED',
        error: 'Upstox is not connected. Complete the token setup below.',
        purpose,
      },
      { status: 503, headers }
    );
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid comparison request.' },
      { status: 400, headers }
    );
  }
  const symbol =
    typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  if (
    !/^[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(symbol) ||
    !['CANDLES', 'QUOTES'].includes(body?.kind) ||
    Object.keys(body).some((k) => !['symbol', 'kind'].includes(k))
  )
    return NextResponse.json(
      {
        success: false,
        error: 'Choose one Nifty 50 cash share and a valid comparison type.',
      },
      { status: 400, headers }
    );
  let universe;
  try {
    universe = await getNifty50Universe();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          'Current Nifty 50 membership could not be verified. No instrument was guessed.',
      },
      { status: 503, headers }
    );
  }
  const member = universe.members.find((m) => m.symbol === symbol);
  if (!member)
    return NextResponse.json(
      {
        success: false,
        error: 'This share is not in the verified current Nifty 50 list.',
      },
      { status: 400, headers }
    );
  // Cash instrument keys use the current official ISIN, not Angel's unrelated token.
  const keys = {
    [symbol]: `NSE_EQ|${member.isin}`,
    NIFTY: 'NSE_INDEX|Nifty 50',
  };
  const deadline = AbortSignal.timeout(35_000);
  const signal = req.signal
    ? AbortSignal.any([deadline, req.signal])
    : deadline;
  const candles: Record<string, CandleData[]> = {},
    quotes: any[] = [],
    errors: any[] = [];
  function failure(s: string, error: unknown) {
    errors.push({
      symbol: s,
      error:
        error instanceof UpstoxComparisonError
          ? error.message
          : 'Upstox comparison request failed.',
      ...(error instanceof UpstoxComparisonError
        ? { code: error.code, providerStatus: error.providerStatus }
        : {}),
    });
  }
  if (body.kind === 'CANDLES') {
    for (const [s, key] of Object.entries(keys)) {
      try {
        candles[s] = await readUpstoxCandles(key, signal);
      } catch (error) {
        failure(s, error);
      }
    }
  } else {
    try {
      for (const q of await readUpstoxQuotes(keys, signal)) {
        if ('error' in q) errors.push(q);
        else quotes.push(q);
      }
    } catch (error) {
      for (const s of Object.keys(keys)) failure(s, error);
    }
  }
  return NextResponse.json(
    {
      success: true,
      purpose,
      provider: 'Upstox',
      symbol,
      isin: member.isin,
      instrumentKeys: keys,
      membershipDate: universe.asOf,
      checkedAt: new Date().toISOString(),
      candles,
      quotes,
      errors,
    },
    { headers }
  );
}
