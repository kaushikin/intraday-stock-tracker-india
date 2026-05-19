import { NextRequest, NextResponse } from "next/server";
import { getAngelMarketData } from "@/lib/angel";

export const dynamic = "force-dynamic";

type QuoteRequestItem = {
  symbol: string;
  exchange: "NSE" | "BSE";
  token: string;
};

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

    const exchangeTokens: Record<string, string[]> = {};

    for (const item of items) {
      if (!exchangeTokens[item.exchange]) {
        exchangeTokens[item.exchange] = [];
      }

      exchangeTokens[item.exchange].push(item.token);
    }

    const angelResponse = await getAngelMarketData(exchangeTokens);

    const fetched = angelResponse?.data?.fetched || [];

    const quotes = fetched.map((q: any) => {
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

    return NextResponse.json({
      success: true,
      quotes,
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