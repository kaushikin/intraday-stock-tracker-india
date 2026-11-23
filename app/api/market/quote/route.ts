import { NextRequest, NextResponse } from 'next/server';
import { AngelRequestError } from '@/lib/angelTransport';
import { getAngelMarketData } from '@/lib/angel';
import { exchangeTimestamp } from '@/lib/marketDataQuality';
import { getCashInstruments } from '@/lib/cashInstruments';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Exchange = 'NSE' | 'BSE' | 'MCX';

type QuoteRequestItem = {
  symbol: string;
  exchange: Exchange;
  token: string;
  tickSize?: number;
  asOf?: string;
};

const MAX_TOKENS_PER_REQUEST = 15;
const CHUNK_DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function isValidExchange(exchange: unknown): exchange is Exchange {
  return exchange === 'NSE' || exchange === 'BSE' || exchange === 'MCX';
}

function normalizeItems(input: unknown): QuoteRequestItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item: any) => ({
      symbol: String(item?.symbol || '')
        .trim()
        .toUpperCase(),
      exchange: item?.exchange,
      token: String(item?.token || '').trim(),
    }))
    .filter((item) => {
      return Boolean(
        item.symbol && item.token && isValidExchange(item.exchange)
      );
    });
}

function dedupeItems(items: QuoteRequestItem[]) {
  const seen = new Set<string>();
  const deduped: QuoteRequestItem[] = [];

  for (const item of items) {
    const key = `${item.exchange}:${item.token}`;

    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function buildQuotesFromAngelResponse(
  angelResponse: any,
  items: QuoteRequestItem[]
) {
  const fetched = angelResponse?.data?.fetched || [];

  return fetched.map((q: any) => {
    const original = items.find((item) => {
      return String(item.token) === String(q.symbolToken);
    });

    return {
      symbol: original?.symbol || q.tradingSymbol?.replace('-EQ', ''),
      exchange: original?.exchange || q.exchange,
      token: String(q.symbolToken || original?.token || ''),
      tradingSymbol: q.tradingSymbol,
      price: Number(q.ltp || 0),
      change: Number(q.netChange || 0),
      changePercent: Number(q.percentChange || 0),
      open: Number(q.open || 0),
      high: Number(q.high || 0),
      low: Number(q.low || 0),
      close: Number(q.close || 0),
      tickSize: original?.tickSize,
      instrumentAsOf: original?.asOf,
      lastUpdated: new Date().toISOString(),
      exchangeTime: exchangeTimestamp(q.exchFeedTime),
      tradeTime: exchangeTimestamp(q.exchTradeTime),
      bid: Number(q.depth?.buy?.[0]?.price || 0),
      ask: Number(q.depth?.sell?.[0]?.price || 0),
      askQuantity: Number(q.depth?.sell?.[0]?.quantity || 0),
    };
  });
}

function buildUnfetchedErrors(angelResponse: any, items: QuoteRequestItem[]) {
  const unfetched = angelResponse?.data?.unfetched || [];

  return unfetched.map((item: any) => {
    const token = String(item?.symbolToken || item?.token || '');
    const original = items.find((requestItem) => {
      return String(requestItem.token) === token;
    });

    return {
      exchange: original?.exchange || item?.exchange || 'UNKNOWN',
      symbol: original?.symbol || item?.tradingSymbol || 'UNKNOWN',
      token,
      error:
        item?.message ||
        item?.error ||
        item?.errorMessage ||
        'Angel did not return this quote',
    };
  });
}

export async function POST(req: NextRequest) {
  const deadline = req.signal
    ? AbortSignal.any([req.signal, AbortSignal.timeout(45_000)])
    : AbortSignal.timeout(45_000);
  try {
    const body = await req.json();

    const normalizedItems = normalizeItems(body.items);
    if (normalizedItems.length > 20)
      return NextResponse.json(
        { success: false, error: 'At most 20 symbols per request.' },
        { status: 400 }
      );
    const instruments = await getCashInstruments();
    const items = dedupeItems(normalizedItems).flatMap((item) =>
      instruments[item.symbol] ? [instruments[item.symbol]] : []
    );

    if (!items.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'No valid symbols provided',
          quotes: [],
          errors: [],
        },
        {
          status: 400,
        }
      );
    }

    const groupedByExchange: Partial<Record<Exchange, QuoteRequestItem[]>> = {};

    for (const item of items) {
      if (!groupedByExchange[item.exchange]) {
        groupedByExchange[item.exchange] = [];
      }

      groupedByExchange[item.exchange]!.push(item);
    }

    const allQuotes: any[] = [];
    const errors: any[] = [];

    for (const [exchange, exchangeItems] of Object.entries(groupedByExchange)) {
      const chunks = chunkArray(exchangeItems, MAX_TOKENS_PER_REQUEST);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];

        try {
          const exchangeTokens: Record<string, string[]> = {
            [exchange]: chunk.map((item) => item.token),
          };

          const angelResponse = await getAngelMarketData(
            exchangeTokens,
            deadline
          );

          const quotes = buildQuotesFromAngelResponse(angelResponse, chunk);
          const unfetchedErrors = buildUnfetchedErrors(angelResponse, chunk);

          allQuotes.push(...quotes);
          errors.push(...unfetchedErrors);

          console.log(
            `Angel quotes loaded: ${exchange} chunk ${chunkIndex + 1}/${
              chunks.length
            } (${quotes.length}/${chunk.length})`
          );
        } catch (error: any) {
          console.error(
            `Quote fetch failed for ${exchange} chunk ${chunkIndex + 1}/${
              chunks.length
            }:`,
            error instanceof AngelRequestError ? error.kind : 'unavailable'
          );

          errors.push({
            exchange,
            chunk: chunkIndex + 1,
            symbols: chunk.map((item) => item.symbol),
            tokens: chunk.map((item) => item.token),
            error: error?.message || 'Failed to fetch quote chunk',
            retryAfterMs:
              error instanceof AngelRequestError ? error.retryAfterMs : 0,
            kind: error instanceof AngelRequestError ? error.kind : 'UNKNOWN',
          });
        }

        if (chunkIndex < chunks.length - 1) {
          await sleep(CHUNK_DELAY_MS);
        }
      }
    }

    const failedCompletely = allQuotes.length === 0 && errors.length > 0;

    if (failedCompletely) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch all quote chunks',
          quotes: [],
          errors,
          summary: {
            requested: items.length,
            fetched: 0,
            errors: errors.length,
            chunkSize: MAX_TOKENS_PER_REQUEST,
          },
        },
        {
          status: 502,
          headers: errors.some((e) => e.retryAfterMs > 0)
            ? {
                'Retry-After': String(
                  Math.max(
                    1,
                    Math.ceil(
                      Math.max(...errors.map((e) => e.retryAfterMs || 0)) / 1000
                    )
                  )
                ),
              }
            : undefined,
        }
      );
    }

    return NextResponse.json({
      success: true,
      quotes: allQuotes,
      errors,
      summary: {
        requested: items.length,
        fetched: allQuotes.length,
        errors: errors.length,
        chunkSize: MAX_TOKENS_PER_REQUEST,
      },
    });
  } catch (error: any) {
    console.error('Angel quote API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to fetch market data',
        quotes: [],
        errors: [],
      },
      {
        status: 500,
      }
    );
  }
}
