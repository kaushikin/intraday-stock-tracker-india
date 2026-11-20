import { NextRequest, NextResponse } from 'next/server';
import { parseSentiment } from '@/lib/sentiment';
export const dynamic = 'force-dynamic';
const MODEL = 'ProsusAI/finbert';
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (
      typeof body.text !== 'string' ||
      !body.text.trim() ||
      body.text.length > 1200
    )
      return NextResponse.json(
        { success: false, error: 'Provide one headline of 1–1200 characters.' },
        { status: 400 }
      );
    const token = process.env.HUGGINGFACE_API_KEY;
    if (!token)
      return NextResponse.json(
        { success: false, error: 'Optional news sentiment is not configured.' },
        { status: 503 }
      );
    const response = await fetch(
      `https://router.huggingface.co/hf-inference/models/${MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: body.text.trim(),
          parameters: { top_k: 3 },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok)
      return NextResponse.json(
        {
          success: false,
          providerStatus: response.status,
          error:
            response.status === 402
              ? 'Hugging Face requires billing or credits (HTTP 402). Sentiment is optional; paper-trade qualification is unaffected.'
              : response.status === 401 || response.status === 403
                ? 'Hugging Face access was denied. Check the configured token and its permissions. Sentiment remains optional.'
                : response.status === 429
                  ? 'Hugging Face rate limit reached. Wait before retrying. Sentiment remains optional.'
                  : `Sentiment provider unavailable (HTTP ${response.status}).`,
        },
        { status: 502 }
      );
    const result = parseSentiment(await response.json());
    return NextResponse.json({
      success: true,
      model: MODEL,
      purpose: 'headline-sentiment-only',
      result,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          'Sentiment unavailable: timeout or invalid response. No fallback score was generated.',
      },
      { status: 502 }
    );
  }
}
