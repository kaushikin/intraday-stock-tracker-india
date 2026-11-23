import { NextRequest, NextResponse } from 'next/server';
import { getAngelCandleData } from '@/lib/angel';
import { getCashInstruments } from '@/lib/cashInstruments';
import { completedCandles } from '@/lib/marketDataQuality';
import { AngelRequestError } from '@/lib/angelTransport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

const pendingCandles = new Map<string, Promise<Candle[]>>();

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

  // Enough prior sessions for 100 complete 15-minute warm-up bars.
  const historyStart = new Date(tradeDate.getTime() - 14 * 86400000);
  const from = makeISTDateTime(historyStart, 9, 15);

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
    .filter((item) => Array.isArray(item) && item.length >= 6)
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
        candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0
      );
    });
}

export async function POST(req: NextRequest) {
  // Leave time to return explicit failures before the client/serverless deadlines.
  const deadline = AbortSignal.timeout(45_000);
  try {
    const body = await req.json();

    const symbols: string[] = Array.isArray(body.symbols)
      ? body.symbols.map((s: string) => String(s).toUpperCase().trim())
      : [];

    const interval = 'FIVE_MINUTE';
    if (body.interval && body.interval !== interval)
      return NextResponse.json(
        {
          success: false,
          error: 'Only five-minute research candles are supported.',
        },
        { status: 400 }
      );
    if (symbols.length > 20)
      return NextResponse.json(
        { success: false, error: 'Request at most 20 symbols.' },
        { status: 400 }
      );

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
    const instruments = await getCashInstruments();

    const result: Record<string, Candle[]> = {};
    const errors: any[] = [];

    if (!global.angelCandleCache) {
      global.angelCandleCache = {};
    }

    for (const [key, value] of Object.entries(global.angelCandleCache)) {
      if (value.expiresAt <= Date.now()) delete global.angelCandleCache[key];
    }
    for (const symbol of [...new Set(symbols)]) {
      const instrument = instruments[symbol];

      if (!instrument || instrument.exchange !== 'NSE') {
        errors.push({
          symbol,
          error:
            'Only supported NSE cash shares and indices are available in this research feed',
        });
        continue;
      }

      const cacheKey = `${symbol}:${instrument.token}:${interval}:${fromdate}:${Math.floor(Date.now() / 300000)}`;
      const cached = global.angelCandleCache[cacheKey];

      if (cached && cached.expiresAt > Date.now()) {
        result[symbol] = cached.candles;
        continue;
      }

      try {
        deadline.throwIfAborted();
        let pending = pendingCandles.get(cacheKey);
        if (!pending) {
          pending = (async () => {
            const response = await getAngelCandleData(
              {
                exchange: instrument.exchange,
                symboltoken: instrument.token,
                interval,
                fromdate,
                todate,
              },
              deadline
            );
            const candles = completedCandles(
              normalizeAngelCandles(response?.data || [])
            );
            if (!candles.length)
              throw new Error('Angel returned no usable completed candles.');
            // Never cache beyond the next candle close or serve expired data after a failure.
            global.angelCandleCache![cacheKey] = {
              expiresAt: Math.min(
                Date.now() + 60_000,
                Date.parse(candles.at(-1)!.time) + 600_000
              ),
              candles,
            };
            return candles;
          })();
          pendingCandles.set(cacheKey, pending);
          // Both handlers consume the cleanup promise; no detached rejected promise.
          void pending.then(
            () => pendingCandles.delete(cacheKey),
            () => pendingCandles.delete(cacheKey)
          );
        }
        result[symbol] = await pending;
      } catch (error: any) {
        // Clear the failed symbol. Never silently promote stale cached candles.
        result[symbol] = [];
        errors.push({
          symbol,
          error: deadline.aborted
            ? 'Candle request timed out. Recheck this stock.'
            : error?.message || 'Failed to fetch candles',
          ...(error instanceof AngelRequestError
            ? {
                providerStatus: error.httpStatus,
                code: error.kind,
                retryable: error.retryable,
              }
            : {}),
        });
      }
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
