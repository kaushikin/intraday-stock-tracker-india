import { CandleData } from '@/contexts/AppContext';

/**
 * Fetch candles from Yahoo Finance via yahoo-finance2
 * No authentication required, 15-min delay (acceptable for signals)
 */
export async function getYfinanceCandleData(
  symbol: string,
  interval: number = 1,
  days: number = 7
): Promise<CandleData[]> {
  try {
    // Dynamically require yahoo-finance2 (may not be installed yet)
    let yahooFinance;
    try {
      yahooFinance = require('yahoo-finance2').default;
    } catch {
      throw new Error(
        'yahoo-finance2 not installed. Run: npm install yahoo-finance2'
      );
    }

    // Map interval minutes to yahoo-finance2 format
    const intervalMap: Record<
      number,
      '1m' | '5m' | '15m' | '30m' | '60m' | '1d'
    > = {
      1: '1m',
      5: '5m',
      15: '15m',
      30: '30m',
      60: '60m',
      1440: '1d',
    };

    const yInterval: '1m' | '5m' | '15m' | '30m' | '60m' | '1d' =
      intervalMap[interval] || '1d';

    // Fetch historical data
    const result = await yahooFinance.chart(symbol, {
      interval: yInterval,
      period1: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    });

    if (!result?.quotes?.length) {
      return [];
    }

    // Normalize to CandleData format
    const candles: CandleData[] = result.quotes.map((quote: any) => ({
      time: new Date(quote.date).toISOString(),
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.close,
      volume: quote.volume || 0,
    }));

    return candles;
  } catch (error: any) {
    console.error(
      `[yfinance] Failed to fetch ${symbol} candles:`,
      error?.message
    );
    throw error;
  }
}
