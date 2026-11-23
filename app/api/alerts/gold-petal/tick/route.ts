import { NextRequest, NextResponse } from 'next/server';
import { petalAlerts } from '@/lib/goldPetalAlertServer';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const json = (body: object, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    });
  try {
    if (
      process.env.VERCEL_ENV === 'preview' ||
      !(await petalAlerts.authenticate(req.headers.get('authorization')))
    )
      return json({ error: 'Unauthorized' }, 401);
    return json(
      await petalAlerts.tick(
        AbortSignal.any([req.signal, AbortSignal.timeout(45000)]),
      ),
    );
  } catch {
    return json({ error: 'Background checks unavailable.' }, 503);
  }
}
