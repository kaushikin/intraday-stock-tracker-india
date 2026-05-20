import { NextRequest, NextResponse } from "next/server";
import { getAngelMarketData } from "@/lib/angel";

export const dynamic = "force-dynamic";

type QuoteRequestItem = {
  symbol: string;
  exchange: "NSE" | "BSE" | "MCX";
  token: string;
};

function buildQuotesFromAngelResponse(
  angelResponse: any,
  items: QuoteRequestItem[]
) {
  const fetched = angelResponse?.data?.fetched || [];

  return fetched.map((q: any) => {
    const original = items.find(
      (item) => String(item.token) === String(q.symbolToken)
    );

    return {
      symbol: original?.symbol || q.tradingSymbol?.replace("-EQ", ""),
      exchange: original?.exchange || q.exchange,
      token: String(q.symbolToken),
      tradingSymbol: q.tradingSymbol,
      price: Number(q.ltp || 0),
      change: Number(q.netChange || 0),
      changePercent: Number(q.percentChange || 0),
      open: Number(q.open || 0),
      high: Number(q.high || 0),
      low: Number(q.low || 0),
      close: Number(q.close || 0),
      lastUpdated: new Date().toISOString(),
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const items = body.items as QuoteRequestItem[];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No symbols provided",
        },
        {
          status: 400,
        }
      );
    }

    const groupedByExchange: Record<string, QuoteRequestItem[]> = {};

    for (const item of items) {
      if (!groupedByExchange[item.exchange]) {
        groupedByExchange[item.exchange] = [];
      }

      groupedByExchange[item.exchange].push(item);
    }

    const allQuotes: any[] = [];
    const errors: any[] = [];

    for (const [exchange, exchangeItems] of Object.entries(groupedByExchange)) {
      try {
        const exchangeTokens: Record<string, string[]> = {
          [exchange]: exchangeItems.map((item) => item.token),
        };

        const angelResponse = await getAngelMarketData(exchangeTokens);

        const quotes = buildQuotesFromAngelResponse(
          angelResponse,
          exchangeItems
        );

        allQuotes.push(...quotes);
      } catch (error: any) {
        console.error(`Quote fetch failed for ${exchange}:`, error);

        errors.push({
          exchange,
          error: error?.message || "Failed to fetch exchange quotes",
        });
      }
    }

    return NextResponse.json({
      success: true,
      quotes: allQuotes,
      errors,
    });
  } catch (error: any) {
    console.error("Angel quote API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch market data",
      },
      {
        status: 500,
      }
    );
  }
}