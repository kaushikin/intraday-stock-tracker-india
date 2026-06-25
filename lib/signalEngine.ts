import { CandleData, PriceData } from '@/contexts/AppContext';
import { isFreshSignalWindowOpenIST } from '@/lib/marketHours';
import { addIndicators } from '@/lib/technicalIndicators';

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

function neutralSignal(
  symbol: string,
  reasons: string[],
  price = 0
): TradeSignal {
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

function getStrength(score: number): SignalStrength {
  if (score >= 8) return 'STRONG';
  if (score >= 6) return 'MEDIUM';
  return 'WEAK';
}

function createBuySignal(
  symbol: string,
  entry: number,
  atr: number,
  reasons: string[],
  score: number
): TradeSignal {
  const risk = Math.max(atr * 1.2, entry * 0.0035);
  const stopLoss = entry - risk;
  const target1 = entry + risk * 1.3;
  const target2 = entry + risk * 2;

  return {
    symbol,
    side: 'BUY',
    strength: getStrength(score),
    entry: round2(entry),
    stopLoss: round2(stopLoss),
    target1: round2(target1),
    target2: round2(target2),
    riskPerShare: round2(risk),
    rewardPerShare: round2(target1 - entry),
    riskReward: round2((target1 - entry) / risk),
    reasons: [...reasons, `BUY score: ${score}/12`],
    status: score >= 8 ? 'STRONG_BUY_WATCH' : 'BUY_WATCH',
  };
}

function createSellSignal(
  symbol: string,
  entry: number,
  atr: number,
  reasons: string[],
  score: number
): TradeSignal {
  const risk = Math.max(atr * 1.2, entry * 0.0035);
  const stopLoss = entry + risk;
  const target1 = entry - risk * 1.3;
  const target2 = entry - risk * 2;

  return {
    symbol,
    side: 'SELL',
    strength: getStrength(score),
    entry: round2(entry),
    stopLoss: round2(stopLoss),
    target1: round2(target1),
    target2: round2(target2),
    riskPerShare: round2(risk),
    rewardPerShare: round2(entry - target1),
    riskReward: round2((entry - target1) / risk),
    reasons: [...reasons, `SELL score: ${score}/12`],
    status: score >= 8 ? 'STRONG_SELL_WATCH' : 'SELL_WATCH',
  };
}


type IndexTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';

type IndexConfirmation = {
  blocked: boolean;
  scoreBoost: number;
  reasons: string[];
};

const BANK_FINANCE_SYMBOLS = new Set([
  'HDFCBANK',
  'ICICIBANK',
  'AXISBANK',
  'SBIN',
  'KOTAKBANK',
  'INDUSINDBK',
  'BANKBARODA',
  'PNB',
  'FEDERALBNK',
  'IDFCFIRSTB',
  'AUBANK',
  'BAJFINANCE',
  'BAJAJFINSV',
]);

function isBankOrFinanceStock(symbol: string) {
  return BANK_FINANCE_SYMBOLS.has(symbol);
}

function getIndexTrend(rawCandles: CandleData[]): IndexTrend {
  if (!rawCandles || rawCandles.length < 12) {
    return 'UNKNOWN';
  }

  const candles = addIndicators(rawCandles);
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const vwap = latest.vwap || 0;
  const ema20 = latest.ema20 || 0;
  const ema50 = latest.ema50 || 0;
  const rsi = latest.rsi14 || 50;
  const previousRsi = previous.rsi14 || 50;

  let bullishScore = 0;
  let bearishScore = 0;

  if (vwap > 0 && latest.close > vwap) bullishScore += 1;
  if (latest.close > ema20) bullishScore += 1;
  if (ema20 >= ema50) bullishScore += 1;
  if (rsi >= 50 && rsi >= previousRsi) bullishScore += 1;

  if (vwap > 0 && latest.close < vwap) bearishScore += 1;
  if (latest.close < ema20) bearishScore += 1;
  if (ema20 <= ema50) bearishScore += 1;
  if (rsi <= 50 && rsi <= previousRsi) bearishScore += 1;

  if (bullishScore >= 3 && bullishScore > bearishScore) {
    return 'BULLISH';
  }

  if (bearishScore >= 3 && bearishScore > bullishScore) {
    return 'BEARISH';
  }

  return 'NEUTRAL';
}

function getIndexConfirmation(
  symbol: string,
  side: SignalSide,
  allCandles: Record<string, CandleData[]>
): IndexConfirmation {
  const reasons: string[] = [];
  let scoreBoost = 0;

  const niftyTrend = getIndexTrend(allCandles.NIFTY || []);
  const bankNiftyTrend = getIndexTrend(allCandles.BANKNIFTY || []);
  const needsBankNifty = isBankOrFinanceStock(symbol);

  if (side === 'BUY') {
    if (niftyTrend === 'BEARISH') {
      return {
        blocked: false,
        scoreBoost: 0,
        reasons: ['No trade: NIFTY trend opposes BUY setup'],
      };
    }

    if (niftyTrend === 'BULLISH') {
      scoreBoost += 1;
      reasons.push('NIFTY trend supports BUY');
    }

    if (needsBankNifty) {
      if (bankNiftyTrend === 'BEARISH') {
        return {
          blocked: false,
          scoreBoost: 0,
          reasons: ['No trade: BANKNIFTY trend opposes bank/finance BUY setup'],
        };
      }

      if (bankNiftyTrend === 'BULLISH') {
        scoreBoost += 1;
        reasons.push('BANKNIFTY confirms bank/finance BUY');
      }
    }
  }

  if (side === 'SELL') {
    if (niftyTrend === 'BULLISH') {
      return {
        blocked: false,
        scoreBoost: 0,
        reasons: ['No trade: NIFTY trend opposes SELL setup'],
      };
    }

    if (niftyTrend === 'BEARISH') {
      scoreBoost += 1;
      reasons.push('NIFTY trend supports SELL');
    }

    if (needsBankNifty) {
      if (bankNiftyTrend === 'BULLISH') {
        return {
          blocked: false,
          scoreBoost: 0,
          reasons: ['No trade: BANKNIFTY trend opposes bank/finance SELL setup'],
        };
      }

      if (bankNiftyTrend === 'BEARISH') {
        scoreBoost += 1;
        reasons.push('BANKNIFTY confirms bank/finance SELL');
      }
    }
  }

  return {
    blocked: false,
    scoreBoost,
    reasons,
  };
}

export function generateSignalForStock(
  symbol: string,
  priceData?: PriceData,
  rawCandles: CandleData[] = [],
  allCandles: Record<string, CandleData[]> = {}
): TradeSignal {
  const price = priceData?.price || 0;

  if (!isFreshSignalWindowOpenIST()) {
    return neutralSignal(
      symbol,
      [
        'No fresh intraday signal outside trading window',
        'Fresh signals are allowed only between 09:30 and 14:45 IST',
      ],
      price
    );
  }

  if (!rawCandles || rawCandles.length < 12) {
    return neutralSignal(
      symbol,
      [
        'Waiting for enough 5-minute candle data',
        'Need at least 12 candles for VWAP, EMA, RSI and ATR confirmation',
      ],
      price
    );
  }

  const candles = addIndicators(rawCandles);
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const entryPrice = price || latest.close;

  const vwap = latest.vwap || 0;
  const ema20 = latest.ema20 || 0;
  const ema50 = latest.ema50 || 0;
  const rsi = latest.rsi14 || 50;
  const atr = latest.atr14 || latest.close * 0.004;
  const avgVolume20 = latest.avgVolume20 || 0;

  const dayHigh = Math.max(...candles.map((candle) => candle.high));
  const dayLow = Math.min(...candles.map((candle) => candle.low));
  const dayRange = dayHigh - dayLow;

  const positionInRange =
    dayRange > 0 ? (latest.close - dayLow) / dayRange : 0.5;

  const candleRange = latest.high - latest.low;
  const candleBody = Math.abs(latest.close - latest.open);
  const strongCandle = candleRange > 0 && candleBody / candleRange >= 0.45;

  const vwapDistancePercent =
    vwap > 0 ? Math.abs((latest.close - vwap) / vwap) * 100 : 0;

  const reasons: string[] = [];

  if (dayRange <= 0) {
    return neutralSignal(symbol, ['Invalid candle range'], entryPrice);
  }

  if (vwapDistancePercent > 1.8) {
    return neutralSignal(
      symbol,
      [
        'No trade: Price is too far from VWAP',
        `VWAP distance: ${round2(vwapDistancePercent)}%`,
        'Avoid chasing extended intraday moves',
      ],
      entryPrice
    );
  }

  if (atr / latest.close < 0.0015) {
    return neutralSignal(
      symbol,
      ['No trade: ATR is too low, market may be sideways'],
      entryPrice
    );
  }

  const emaGapPercent = Math.abs((ema20 - ema50) / latest.close) * 100;

  if (emaGapPercent < 0.05) {
    return neutralSignal(
      symbol,
      [
        'No trade: EMA 20 and EMA 50 are too close',
        'Market is likely sideways or unclear',
      ],
      entryPrice
    );
  }

  let buyScore = 0;
  const buyReasons: string[] = [];

  if (latest.close > vwap) {
    buyScore += 2;
    buyReasons.push('Price is above VWAP');
  }

  if (latest.close > ema20) {
    buyScore += 1;
    buyReasons.push('Price is above EMA 20');
  }

  if (ema20 > ema50) {
    buyScore += 2;
    buyReasons.push('EMA 20 is above EMA 50');
  }

  if (rsi >= 45 && rsi <= 70 && rsi > (previous.rsi14 || 50)) {
    buyScore += 2;
    buyReasons.push('RSI is healthy and rising');
  }

  if (avgVolume20 > 0 && latest.volume > avgVolume20 * 1.1) {
    buyScore += 1;
    buyReasons.push('Volume is above average');
  }

  if (strongCandle && latest.close > latest.open) {
    buyScore += 1;
    buyReasons.push('Latest candle has bullish body strength');
  }

  if (positionInRange >= 0.45 && positionInRange <= 0.9) {
    buyScore += 1;
    buyReasons.push('Price is strong but not at extreme day high');
  }

  let sellScore = 0;
  const sellReasons: string[] = [];

  if (latest.close < vwap) {
    sellScore += 2;
    sellReasons.push('Price is below VWAP');
  }

  if (latest.close < ema20) {
    sellScore += 1;
    sellReasons.push('Price is below EMA 20');
  }

  if (ema20 < ema50) {
    sellScore += 2;
    sellReasons.push('EMA 20 is below EMA 50');
  }

  if (rsi <= 55 && rsi >= 30 && rsi < (previous.rsi14 || 50)) {
    sellScore += 2;
    sellReasons.push('RSI is weak and falling');
  }

  if (avgVolume20 > 0 && latest.volume > avgVolume20 * 1.1) {
    sellScore += 1;
    sellReasons.push('Volume is above average');
  }

  if (strongCandle && latest.close < latest.open) {
    sellScore += 1;
    sellReasons.push('Latest candle has bearish body strength');
  }

  if (positionInRange <= 0.55 && positionInRange >= 0.1) {
    sellScore += 1;
    sellReasons.push('Price is weak but not at extreme day low');
  }

  const MIN_SCORE = 6;

  if (buyScore >= MIN_SCORE && buyScore > sellScore) {
    const indexConfirmation = getIndexConfirmation(symbol, 'BUY', allCandles);

    if (indexConfirmation.blocked) {
      return neutralSignal(
        symbol,
        [
          ...indexConfirmation.reasons,
          `BUY score before index filter: ${buyScore}/12`,
        ],
        entryPrice
      );
    }

    buyScore += indexConfirmation.scoreBoost;
    buyReasons.push(...indexConfirmation.reasons);

    return createBuySignal(symbol, entryPrice, atr, buyReasons, buyScore);
  }

  if (sellScore >= MIN_SCORE && sellScore > buyScore) {
    const indexConfirmation = getIndexConfirmation(symbol, 'SELL', allCandles);

    if (indexConfirmation.blocked) {
      return neutralSignal(
        symbol,
        [
          ...indexConfirmation.reasons,
          `SELL score before index filter: ${sellScore}/12`,
        ],
        entryPrice
      );
    }

    sellScore += indexConfirmation.scoreBoost;
    sellReasons.push(...indexConfirmation.reasons);

    return createSellSignal(symbol, entryPrice, atr, sellReasons, sellScore);
  }

  reasons.push('No clean high-probability setup');
  reasons.push(`BUY score: ${buyScore}/12`);
  reasons.push(`SELL score: ${sellScore}/12`);
  reasons.push(`RSI: ${round2(rsi)}`);
  reasons.push(`VWAP: ₹${round2(vwap)}`);
  reasons.push(`EMA20: ₹${round2(ema20)}`);
  reasons.push(`EMA50: ₹${round2(ema50)}`);
  reasons.push(`ATR: ₹${round2(atr)}`);

  return neutralSignal(symbol, reasons, entryPrice);
}

export function generateSignals(
  watchlist: string[],
  prices: Record<string, PriceData>,
  candles: Record<string, CandleData[]> = {}
): TradeSignal[] {
  return watchlist.map((symbol) =>
    generateSignalForStock(
      symbol,
      prices[symbol],
      candles[symbol] || [],
      candles
    )
  );
}
