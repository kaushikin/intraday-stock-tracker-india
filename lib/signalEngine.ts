import { PriceData } from '@/contexts/AppContext';

export type SignalSide = 'BUY' | 'SELL' | 'NEUTRAL';

export type SignalStrength = 'STRONG' | 'MEDIUM' | 'WEAK';

export type TradeSignal = {
  symbol: string;
  side: SignalSide;
  strength: SignalStrength;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskPerShare: number;
  rewardPerShare: number;
  riskReward: number;
  reasons: string[];
  status: string;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function generateSignalForStock(
  symbol: string,
  priceData?: PriceData
): TradeSignal {
  const price = priceData?.price || 0;
  const change = priceData?.change || 0;
  const open = priceData?.open || 0;
  const high = priceData?.high || 0;
  const low = priceData?.low || 0;

  if (!price || !open || !high || !low) {
    return {
      symbol,
      side: 'NEUTRAL',
      strength: 'WEAK',
      entry: 0,
      stopLoss: 0,
      target1: 0,
      target2: 0,
      riskPerShare: 0,
      rewardPerShare: 0,
      riskReward: 0,
      reasons: ['Waiting for live market data'],
      status: 'WAITING_FOR_DATA',
    };
  }

  const range = high - low;
  const nearHigh = range > 0 ? price >= high - range * 0.25 : false;
  const nearLow = range > 0 ? price <= low + range * 0.25 : false;
  const aboveOpen = price > open;
  const belowOpen = price < open;

  const buyReasons: string[] = [];
  const sellReasons: string[] = [];

  if (aboveOpen) buyReasons.push('Price is trading above open');
  if (change > 0) buyReasons.push('Stock is positive for the day');
  if (nearHigh) buyReasons.push('Price is trading near day high');

  if (belowOpen) sellReasons.push('Price is trading below open');
  if (change < 0) sellReasons.push('Stock is negative for the day');
  if (nearLow) sellReasons.push('Price is trading near day low');

  const isBuy = aboveOpen && change > 0 && nearHigh;
  const isSell = belowOpen && change < 0 && nearLow;

  if (isBuy) {
    const entry = price;
    const stopLoss = low;
    const risk = Math.max(entry - stopLoss, entry * 0.003);
    const target1 = entry + risk;
    const target2 = entry + risk * 2;

    return {
      symbol,
      side: 'BUY',
      strength: buyReasons.length >= 3 ? 'STRONG' : 'MEDIUM',
      entry: round2(entry),
      stopLoss: round2(stopLoss),
      target1: round2(target1),
      target2: round2(target2),
      riskPerShare: round2(risk),
      rewardPerShare: round2(target1 - entry),
      riskReward: round2((target1 - entry) / risk),
      reasons: buyReasons,
      status: 'BUY_WATCH',
    };
  }

  if (isSell) {
    const entry = price;
    const stopLoss = high;
    const risk = Math.max(stopLoss - entry, entry * 0.003);
    const target1 = entry - risk;
    const target2 = entry - risk * 2;

    return {
      symbol,
      side: 'SELL',
      strength: sellReasons.length >= 3 ? 'STRONG' : 'MEDIUM',
      entry: round2(entry),
      stopLoss: round2(stopLoss),
      target1: round2(target1),
      target2: round2(target2),
      riskPerShare: round2(risk),
      rewardPerShare: round2(entry - target1),
      riskReward: round2((entry - target1) / risk),
      reasons: sellReasons,
      status: 'SELL_WATCH',
    };
  }

  const reasons = [
    'No clean intraday setup yet',
    `Price: ₹${round2(price)}`,
    `Open: ₹${round2(open)}`,
    `High: ₹${round2(high)}`,
    `Low: ₹${round2(low)}`,
  ];

  return {
    symbol,
    side: 'NEUTRAL',
    strength: 'WEAK',
    entry: round2(price),
    stopLoss: 0,
    target1: 0,
    target2: 0,
    riskPerShare: 0,
    rewardPerShare: 0,
    riskReward: 0,
    reasons,
    status: 'NO_TRADE',
  };
}

export function generateSignals(
  watchlist: string[],
  prices: Record<string, PriceData>
): TradeSignal[] {
  return watchlist.map((symbol) => generateSignalForStock(symbol, prices[symbol]));
}