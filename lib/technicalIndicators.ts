import type { CandleData } from '@/contexts/AppContext';
import { istDateKey } from './marketHours';
export type IndicatorCandle = CandleData & {
  vwap?: number;
  ema20?: number;
  ema50?: number;
  rsi14?: number;
  atr14?: number;
  adx14?: number;
  avgVolume20?: number;
};
export function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
export function ema(values: number[], period: number): number[] {
  const result: number[] = [];
  values.forEach((value, i) =>
    result.push(
      i ? result[i - 1] + (2 / (period + 1)) * (value - result[i - 1]) : value
    )
  );
  return result;
}
export function wilder(values: number[], period = 14): (number | undefined)[] {
  const out: (number | undefined)[] = values.map(() => undefined);
  if (values.length < period) return out;
  out[period - 1] = average(values.slice(0, period));
  for (let i = period; i < values.length; i++)
    out[i] = (out[i - 1]! * (period - 1) + values[i]) / period;
  return out;
}
export function addIndicators(candles: CandleData[]): IndicatorCandle[] {
  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20),
    ema50 = ema(closes, 50);
  const gains: number[] = [],
    losses: number[] = [],
    tr: number[] = [],
    plus: number[] = [],
    minus: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i],
      p = candles[i - 1],
      change = c.close - p.close,
      up = c.high - p.high,
      down = p.low - c.low;
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
    tr.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - p.close),
        Math.abs(c.low - p.close)
      )
    );
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const g = wilder(gains),
    l = wilder(losses),
    atr = wilder(tr),
    plusDM = wilder(plus),
    minusDM = wilder(minus);
  const dx = plusDM.slice(13).map((value, i) => {
    const sum = value! + minusDM[i + 13]!;
    return sum > 0 ? (100 * Math.abs(value! - minusDM[i + 13]!)) / sum : 0;
  });
  const adx = wilder(dx);
  let session = '',
    pv = 0,
    volume = 0;
  return candles.map((c, i) => {
    const day = istDateKey(new Date(c.time));
    if (day !== session) {
      session = day;
      pv = 0;
      volume = 0;
    }
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    volume += c.volume;
    const gain = g[i - 1],
      loss = l[i - 1];
    const rsi =
      gain === undefined || loss === undefined
        ? undefined
        : gain === 0 && loss === 0
          ? 50
          : loss === 0
            ? 100
            : 100 - 100 / (1 + gain / loss);
    return {
      ...c,
      vwap: volume > 0 ? pv / volume : undefined,
      ema20: ema20[i],
      ema50: ema50[i],
      rsi14: rsi,
      atr14: atr[i - 1],
      adx14: i >= 14 ? adx[i - 14] : undefined,
      avgVolume20: average(
        candles.slice(Math.max(0, i - 20), i).map((c) => c.volume)
      ),
    };
  });
}
