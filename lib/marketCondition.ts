export type MarketRegime = 'favorable' | 'caution' | 'unfavorable';
export type VolatilityLevel = 'low' | 'normal' | 'high';
export type TrendStrength = 'weak' | 'moderate' | 'strong';

export interface MarketCondition {
  regime: MarketRegime;
  volatility: VolatilityLevel;
  trendStrength: TrendStrength;
  adxValue: number;
  atrPercent: number;
  recommendation: string;
}

interface NormalizedCandle {
  high: number;
  low: number;
  close: number;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function normalizeCandle(candle: unknown): NormalizedCandle | null {
  // Angel candle format is usually:
  // [timestamp, open, high, low, close, volume]
  if (Array.isArray(candle)) {
    const high = toNumber(candle[2]);
    const low = toNumber(candle[3]);
    const close = toNumber(candle[4]);

    if (high !== null && low !== null && close !== null) {
      return { high, low, close };
    }

    return null;
  }

  if (typeof candle === 'object' && candle !== null) {
    const obj = candle as Record<string, unknown>;

    const high = toNumber(obj.high ?? obj.h);
    const low = toNumber(obj.low ?? obj.l);
    const close = toNumber(obj.close ?? obj.c);

    if (high !== null && low !== null && close !== null) {
      return { high, low, close };
    }
  }

  return null;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateAtrAndAdx(candles: NormalizedCandle[], period = 14): {
  atr: number;
  adx: number;
} {
  if (candles.length < period + 1) {
    return { atr: 0, adx: 0 };
  }

  const trueRanges: number[] = [];
  const plusDmValues: number[] = [];
  const minusDmValues: number[] = [];
  const dxValues: number[] = [];

  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];

    const highLow = current.high - current.low;
    const highPrevClose = Math.abs(current.high - previous.close);
    const lowPrevClose = Math.abs(current.low - previous.close);

    const trueRange = Math.max(highLow, highPrevClose, lowPrevClose);

    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    trueRanges.push(trueRange);
    plusDmValues.push(plusDm);
    minusDmValues.push(minusDm);
  }

  const start = Math.max(0, trueRanges.length - period);
  const recentTr = trueRanges.slice(start);
  const recentPlusDm = plusDmValues.slice(start);
  const recentMinusDm = minusDmValues.slice(start);

  const atr = average(recentTr);
  const plusDmAverage = average(recentPlusDm);
  const minusDmAverage = average(recentMinusDm);

  const plusDi = atr > 0 ? 100 * (plusDmAverage / atr) : 0;
  const minusDi = atr > 0 ? 100 * (minusDmAverage / atr) : 0;

  const diSum = plusDi + minusDi;
  const latestDx = diSum > 0 ? 100 * Math.abs(plusDi - minusDi) / diSum : 0;

  dxValues.push(latestDx);

  return {
    atr,
    adx: average(dxValues),
  };
}

export function analyzeMarketCondition(rawCandles: unknown[]): MarketCondition {
  const candles = rawCandles
    .map(normalizeCandle)
    .filter((candle): candle is NormalizedCandle => candle !== null);

  if (candles.length < 15) {
    return {
      regime: 'caution',
      volatility: 'normal',
      trendStrength: 'weak',
      adxValue: 0,
      atrPercent: 0,
      recommendation: 'Not enough NIFTY candle data yet. Trade selectively until market condition stabilizes.',
    };
  }

  const latestClose = candles[candles.length - 1].close;
  const { atr, adx } = calculateAtrAndAdx(candles);

  const atrPercent = latestClose > 0 ? (atr / latestClose) * 100 : 0;

  let volatility: VolatilityLevel = 'normal';
  if (atrPercent < 0.35) volatility = 'low';
  else if (atrPercent > 0.9) volatility = 'high';

  let trendStrength: TrendStrength = 'moderate';
  if (adx < 18) trendStrength = 'weak';
  else if (adx >= 25) trendStrength = 'strong';

  let regime: MarketRegime = 'favorable';
  let recommendation = 'Market conditions are acceptable for normal signal execution. Follow risk rules.';

  if (volatility === 'high' && trendStrength === 'weak') {
    regime = 'unfavorable';
    recommendation = 'High volatility with weak trend. Avoid low-quality trades and reduce position size.';
  } else if (volatility === 'high') {
    regime = 'caution';
    recommendation = 'Volatility is elevated. Use smaller size and wider stops.';
  } else if (trendStrength === 'weak') {
    regime = 'caution';
    recommendation = 'Trend strength is weak. Prefer only high-confidence setups.';
  } else if (trendStrength === 'strong') {
    regime = 'favorable';
    recommendation = 'Trend strength is healthy and volatility is controlled. Market is favorable for quality setups.';
  }

  return {
    regime,
    volatility,
    trendStrength,
    adxValue: adx,
    atrPercent,
    recommendation,
  };
}

export default analyzeMarketCondition;
