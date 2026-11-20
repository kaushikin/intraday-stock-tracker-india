import type { CandleData } from '@/contexts/AppContext';
import { completedCandles, candleProblem } from './marketDataQuality';
import { addIndicators } from './technicalIndicators';
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
  available: boolean;
}
export function analyzeMarketCondition(
  raw: unknown[],
  now = new Date()
): MarketCondition {
  const normalized = raw
    .map((item: any) =>
      Array.isArray(item)
        ? {
            time: String(item[0]),
            open: Number(item[1]),
            high: Number(item[2]),
            low: Number(item[3]),
            close: Number(item[4]),
            volume: Number(item[5]),
          }
        : item
    )
    .filter(Boolean) as CandleData[];
  const candles = completedCandles(normalized, now);
  const problem = candleProblem(candles, now);
  const latest = addIndicators(candles).at(-1);
  if (problem || latest?.adx14 === undefined || latest?.atr14 === undefined)
    return {
      regime: 'caution',
      volatility: 'normal',
      trendStrength: 'weak',
      adxValue: 0,
      atrPercent: 0,
      available: false,
      recommendation: problem || 'Indicator warm-up incomplete.',
    };
  const atrPercent = (latest.atr14 / latest.close) * 100,
    adx = latest.adx14;
  const volatility: VolatilityLevel =
    atrPercent < 0.35 ? 'low' : atrPercent > 0.9 ? 'high' : 'normal';
  const trendStrength: TrendStrength =
    adx < 18 ? 'weak' : adx >= 25 ? 'strong' : 'moderate';
  return {
    regime:
      volatility === 'high' && trendStrength === 'weak'
        ? 'unfavorable'
        : volatility === 'high' || trendStrength === 'weak'
          ? 'caution'
          : 'favorable',
    volatility,
    trendStrength,
    adxValue: adx,
    atrPercent,
    available: true,
    recommendation:
      'Descriptive research indicator. Regime thresholds are unvalidated and do not authorize a trade.',
  };
}
export default analyzeMarketCondition;
