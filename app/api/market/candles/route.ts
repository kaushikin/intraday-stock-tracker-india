import { NextRequest, NextResponse } from 'next/server';
import { getAngelCandleData } from '@/lib/angel';
import { INSTRUMENTS } from '@/lib/instruments';

export const dynamic = 'force-dynamic';

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type CandleCacheValue = {
  expiresAt: number;
  candles: Candle[];
};

declare global {
  // eslint-disable-next-line no-var
  var angelCandleCache: Record<string, CandleCacheValue> | undefined;
}

const CANDLE_CACHE_TTL_MS = 2 * 60 * 1000;
const CANDLE_SYMBOL_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatAngelDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

function getISTDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return map;
}

function isWeekendIST(date: Date) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(date);

  return weekday === 'Sat' || weekday === 'Sun';
}

function previousCalendarDay(date: Date) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return previous;
}

function previousTradingDay(date: Date) {
  let candidate = previousCalendarDay(date);

  while (isWeekendIST(candidate)) {
    candidate = previousCalendarDay(candidate);
  }

  return candidate;
}

function makeISTDateTime(baseDate: Date, hour: number, minute: number) {
  const parts = getISTDateParts(baseDate);

  const utcDate = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(
      2,
      '0'
    )}:${String(minute).padStart(2, '0')}:00+05:30`
  );

  return utcDate;
}

function getTodayAngelRange() {
  const now = new Date();
  const istParts = getISTDateParts(now);

  const currentHour = Number(istParts.hour || 0);
  const currentMinute = Number(istParts.minute || 0);
  const minutesNow = currentHour * 60 + currentMinute;
  const marketOpenMinutes = 9 * 60 + 15;

  let tradeDate = now;

  // If before market open or weekend, fetch previous trading day candles.
  if (minutesNow < marketOpenMinutes || isWeekendIST(now)) {
    tradeDate = previousTradingDay(now);
  }

  const from = makeISTDateTime(tradeDate, 9, 15);

  let to: Date;

  if (tradeDate === now) {
    to = now;
  } else {
    to = makeISTDateTime(tradeDate, 15, 30);
  }

  return {
    fromdate: formatAngelDate(from),
    todate: formatAngelDate(to),
  };
}

function normalizeAngelCandles(rawCandles: any[]): Candle[] {
  return rawCandles
    .map((item) => {
      return {
        time: String(item[0]),
        open: Number(item[1] || 0),
        high: Number(item[2] || 0),
        low: Number(item[3] || 0),
        close: Number(item[4] || 0),
        volume: Number(item[5] || 0),
      };
    })
    .filter((candle) => {
      return (
        candle.open > 0 &&
        candle.high > 0 &&
        candle.low > 0 &&
        candle.close > 0
      );
    });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const symbols: string[] = Array.isArray(body.symbols)
      ? body.symbols.map((s: string) => String(s).toUpperCase().trim())
      : [];

    const interval = body.interval || 'FIVE_MINUTE';

    if (!symbols.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'No symbols provided',
        },
        {
          status: 400,
        }
      );
    }

    const { fromdate, todate } = getTodayAngelRange();

    const result: Record<string, Candle[]> = {};
    const errors: any[] = [];

    if (!global.angelCandleCache) {
      global.angelCandleCache = {};
    }

    for (const symbol of symbols) {
      const instrument = INSTRUMENTS[symbol];

      if (!instrument) {
        errors.push({
          symbol,
          error: 'Instrument not found',
        });
        continue;
      }

      const cacheKey = `${symbol}:${interval}:${fromdate}:${todate}`;
      const cached = global.angelCandleCache[cacheKey];

      if (cached && cached.expiresAt > Date.now()) {
        result[symbol] = cached.candles;
        continue;
      }

      try {
        const angelResponse = await getAngelCandleData({
          exchange: instrument.exchange,
          symboltoken: instrument.token,
          interval,
          fromdate,
          todate,
        });

        const normalizedCandles = normalizeAngelCandles(angelResponse?.data || []);

        result[symbol] = normalizedCandles;

        global.angelCandleCache[cacheKey] = {
          expiresAt: Date.now() + CANDLE_CACHE_TTL_MS,
          candles: normalizedCandles,
        };
      } catch (error: any) {
        errors.push({
          symbol,
          error: error?.message || 'Failed to fetch candles',
        });
      }

      await sleep(CANDLE_SYMBOL_DELAY_MS);
    }

    return NextResponse.json({
      success: true,
      interval,
      fromdate,
      todate,
      candles: result,
      errors,
    });
  } catch (error: any) {
    console.error('Candles API error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to fetch candle data',
      },
      {
        status: 500,
      }
    );
  }
}
