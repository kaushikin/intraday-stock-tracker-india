import { NextRequest, NextResponse } from 'next/server';
import { petalAlerts, ALERT_ORIGIN } from '@/lib/goldPetalAlertServer';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const json = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
export async function GET() {
  try {
    return json(await petalAlerts.status());
  } catch {
    return json(
      {
        error: 'Background alert storage is unavailable. Alerts are not ready.',
      },
      503,
    );
  }
}
export async function POST(req: NextRequest) {
  if (
    req.headers.get('origin') !== ALERT_ORIGIN ||
    process.env.VERCEL_ENV === 'preview'
  )
    return json(
      { error: 'Configure alerts from the signed-in production app.' },
      403,
    );
  try {
    const raw = await req.text();
    if (raw.length > 12000) return json({ error: 'Request too large.' }, 413);
    const body = JSON.parse(raw);
    switch (body?.action) {
      case 'connect':
        await petalAlerts.connect(body.token, body.freeConfirmed);
        break;
      case 'arm':
        return json(
          await petalAlerts.arm(
            body.risk,
            body.subscription,
            body.acknowledged,
          ),
        );
      case 'confirm':
        if (typeof body.revision !== 'string' || body.revision.length > 100)
          throw new Error();
        await petalAlerts.confirm(body.revision);
        break;
      case 'stop':
        if (
          body.revision !== undefined &&
          (typeof body.revision !== 'string' || body.revision.length > 100)
        )
          throw new Error();
        await petalAlerts.stop(body.revision);
        break;
      default:
        return json({ error: 'Unsupported alert action.' }, 400);
    }
    return json({ success: true });
  } catch (e) {
    // Only our user-facing validation errors; never return provider bodies/tokens.
    const message =
      e instanceof Error &&
      /^(Confirm|Select QStash|Scheduler |Connect the free|Today’s entry|Invalid browser|This browser|The alert test)/.test(
        e.message,
      )
        ? e.message
        : 'Alert setup failed. Check the connection and try again; no trade was recorded.';
    return json({ error: message }, 400);
  }
}
