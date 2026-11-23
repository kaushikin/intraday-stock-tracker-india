import { NextRequest, NextResponse } from 'next/server';
import { angelBudget, ANGEL_LIMITS } from '@/lib/angelRateLimit';
import { AngelRequestError } from '@/lib/angelErrors';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;
export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const snapshot = await angelBudget.status(req.signal);
    return NextResponse.json(
      {
        success: true,
        scope: 'Shared across Angel login, quotes and candles',
        limits: ANGEL_LIMITS,
        ...snapshot,
      },
      { headers }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        limits: ANGEL_LIMITS,
        error:
          error instanceof AngelRequestError
            ? error.message
            : 'Shared tracking could not be checked. Broker requests remain protected.',
      },
      { status: 503, headers }
    );
  }
}
