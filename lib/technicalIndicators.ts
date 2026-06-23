import { CandleData } from '@/contexts/AppContext';

export type IndicatorCandle = CandleData & {
  vwap?: number;
  ema20?: number;
  ema50?: number;
  rsi14?: number;
  atr14?: number;
  avgVolume20?: number;
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateEMA(values: number[], period: number) {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  values.forEach((value, index) => {
    if (index === 0) {
      result.push(value);
      return;
    }

    const previousEma = result[index - 1];
    result.push(value * multiplier + previousEma * (1 - multiplier));
  });

  return result;
}

function calculateRSI(values: number[], period = 14) {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      result.push(50);
      continue;
    }

    let gains = 0;
    let losses = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const change = values[j] - values[j - 1];

      if (change > 0) gains += change;
      if (change < 0) losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) {
      result.push(100);
      continue;
    }

    const rs = avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }

  return result;
}

function calculateATR(candles: CandleData[], period = 14) {
  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    if (i === 0) {
      trueRanges.push(candle.high - candle.low);
      continue;
    }

    const previousClose = candles[i - 1].close;

    const tr = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );

    trueRanges.push(tr);
  }

  return trueRanges.map((_, index) => {
    if (index < period) {
      return average(trueRanges.slice(0, index + 1));
    }

    return average(trueRanges.slice(index - period + 1, index + 1));
  });
}

export function addIndicators(candles: CandleData[]): IndicatorCandle[] {
  if (!candles.length) return [];

  const closes = candles.map((candle) => candle.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi14 = calculateRSI(closes, 14);
  const atr14 = calculateATR(candles, 14);

  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;

  return candles.map((candle, index) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;

    cumulativeTypicalVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    const volumeWindow = candles
      .slice(Math.max(0, index - 19), index + 1)
      .map((item) => item.volume);

    return {
      ...candle,
      vwap:
        cumulativeVolume > 0
          ? cumulativeTypicalVolume / cumulativeVolume
          : candle.close,
      ema20: ema20[index],
      ema50: ema50[index],
      rsi14: rsi14[index],
      atr14: atr14[index],
      avgVolume20: average(volumeWindow),
    };
  });
}
