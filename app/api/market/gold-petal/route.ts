import { NextRequest, NextResponse } from 'next/server';
import { loadPetalFeed } from '@/lib/goldPetalServer';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON object.' }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => k !== 'contract') ||
    (body.contract !== undefined &&
      (typeof body.contract !== 'string' ||
        !/^GOLDPETAL\d{2}[A-Z]{3}\d{2}FUT$/.test(body.contract)))
  )
    return NextResponse.json(
      { error: 'Only a Gold Petal contract selector is supported.' },
      { status: 400 }
    );
  const result = await loadPetalFeed(
    AbortSignal.any([req.signal, AbortSignal.timeout(45000)]),
    body.contract
  );
  return NextResponse.json(result, {
    status: result.quote ? 200 : result.retryAfterMs ? 429 : 503,
    headers: {
      'Cache-Control': 'private, no-store',
      ...(result.retryAfterMs
        ? { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) }
        : {}),
    },
  });
}
