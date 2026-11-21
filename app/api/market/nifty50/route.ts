import { NextResponse } from 'next/server';
import { getNifty50Universe } from '@/lib/nifty50';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function GET() {
  try {
    return NextResponse.json(
      { success: true, universe: await getNifty50Universe() },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          'The official Nifty 50 constituent file could not be verified. Try again later; no old or partial list was substituted.',
      },
      { status: 503 }
    );
  }
}
