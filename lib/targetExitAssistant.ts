import type { TradeSignal } from '@/lib/signalEngine';

export type CandleForTargetExit = {
  time?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type TargetExitRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type TargetExitConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type TargetExitSuggestedAction =
  | 'HOLD'
  | 'BOOK_PARTIAL'
  | 'MOVE_SL_TO_COST'
  | 'TRAIL_SL'
  | 'EXIT_REMAINING';

export type TargetExitAnalysis = {
  targetProgressPercent: number;
  target1Hit: boolean;
  nearTarget1: boolean;
  reversalRisk: TargetExitRisk;
  holdToTarget2Confidence: TargetExitConfidence;
  suggestedAction: TargetExitSuggestedAction;
  reasons: string[];
};

type AnalyzeTargetExitInput = {
  signal: TradeSignal;
  currentPrice: number;
  candles?: CandleForTargetExit[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateEMA(values: number[], period: number) {
  if (values.length < period) return 0;

  const multiplier = 2 / (period + 1);
  let ema = average(values.slice(0, period));

  for (let index = period; index < values.length; index += 1) {
    ema = values[index] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

function calculateATR(candles: CandleForTargetExit[], period = 14) {
  if (candles.length < 2) return 0;

  const ranges: number[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];

    const trueRange = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    ranges.push(trueRange);
  }

  return average(ranges.slice(-period));
}

function calculateVWAP(candles: CandleForTargetExit[]) {
  if (!candles.length) return 0;

  let priceVolume = 0;
  let volumeTotal = 0;
  let fallbackTypicalTotal = 0;

  for (const candle of candles) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const volume = Number(candle.volume || 0);

    fallbackTypicalTotal += typical;

    if (volume > 0) {
      priceVolume += typical * volume;
      volumeTotal += volume;
    }
  }

  if (volumeTotal > 0) {
    return priceVolume / volumeTotal;
  }

  return fallbackTypicalTotal / candles.length;
}

function calculateRSIValues(closes: number[], period = 14) {
  if (closes.length <= period + 1) {
    return {
      latest: 50,
      previous: 50,
    };
  }

  const rsiSeries: number[] = [];

  for (let end = period; end < closes.length; end += 1) {
    let gains = 0;
    let losses = 0;

    for (let index = end - period + 1; index <= end; index += 1) {
      const change = closes[index] - closes[index - 1];

      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const averageGain = gains / period;
    const averageLoss = losses / period;

    if (averageLoss === 0) {
      rsiSeries.push(100);
    } else {
      const rs = averageGain / averageLoss;
      rsiSeries.push(100 - 100 / (1 + rs));
    }
  }

  return {
    latest: rsiSeries[rsiSeries.length - 1] ?? 50,
    previous: rsiSeries[rsiSeries.length - 2] ?? rsiSeries[rsiSeries.length - 1] ?? 50,
  };
}

function getRiskLabel(score: number): TargetExitRisk {
  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

function getConfidenceLabel(score: number): TargetExitConfidence {
  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

function actionFromAnalysis(params: {
  target1Hit: boolean;
  nearTarget1: boolean;
  currentR: number;
  reversalRisk: TargetExitRisk;
  holdToTarget2Confidence: TargetExitConfidence;
}): TargetExitSuggestedAction {
  const {
    target1Hit,
    nearTarget1,
    currentR,
    reversalRisk,
    holdToTarget2Confidence,
  } = params;

  if (target1Hit && reversalRisk === 'HIGH') {
    return 'EXIT_REMAINING';
  }

  if (target1Hit && holdToTarget2Confidence === 'HIGH') {
    return 'TRAIL_SL';
  }

  if (target1Hit) {
    return 'MOVE_SL_TO_COST';
  }

  if (nearTarget1 && reversalRisk === 'HIGH') {
    return 'BOOK_PARTIAL';
  }

  if (currentR >= 0.7) {
    return 'MOVE_SL_TO_COST';
  }

  return 'HOLD';
}

export function getTargetExitActionLabel(action: TargetExitSuggestedAction) {
  switch (action) {
    case 'BOOK_PARTIAL':
      return 'Book Partial';
    case 'MOVE_SL_TO_COST':
      return 'Move SL Near Cost';
    case 'TRAIL_SL':
      return 'Trail SL / Hold Remaining';
    case 'EXIT_REMAINING':
      return 'Exit Remaining';
    case 'HOLD':
    default:
      return 'Hold';
  }
}

export function analyzeTargetExit({
  signal,
  currentPrice,
  candles = [],
}: AnalyzeTargetExitInput): TargetExitAnalysis | null {
  if (signal.side !== 'BUY' && signal.side !== 'SELL') {
    return null;
  }

  if (!currentPrice || !signal.entry || !signal.target1) {
    return null;
  }

  const isBuy = signal.side === 'BUY';
  const risk =
    signal.riskPerShare ||
    Math.abs(Number(signal.entry || 0) - Number(signal.stopLoss || 0));

  if (!risk) {
    return null;
  }

  const profitPerShare = isBuy
    ? currentPrice - signal.entry
    : signal.entry - currentPrice;

  const currentR = profitPerShare / risk;

  const targetMove = isBuy
    ? signal.target1 - signal.entry
    : signal.entry - signal.target1;

  if (targetMove <= 0) {
    return null;
  }

  const rawProgress = isBuy
    ? ((currentPrice - signal.entry) / targetMove) * 100
    : ((signal.entry - currentPrice) / targetMove) * 100;

  const targetProgressPercent = clamp(rawProgress, 0, 150);

  const target1Hit = isBuy
    ? currentPrice >= signal.target1
    : currentPrice <= signal.target1;

  const usefulCandles = candles.filter((candle) => {
    return (
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    );
  });

  const latest = usefulCandles[usefulCandles.length - 1];
  const closes = usefulCandles.map((candle) => candle.close);
  const atr = calculateATR(usefulCandles);
  const ema20 = calculateEMA(closes, 20);
  const vwap = calculateVWAP(usefulCandles);
  const averageVolume20 = average(
    usefulCandles.slice(-20).map((candle) => Number(candle.volume || 0))
  );
  const rsi = calculateRSIValues(closes);

  const distanceToTarget1 = isBuy
    ? signal.target1 - currentPrice
    : currentPrice - signal.target1;

  const nearByAtr =
    atr > 0 && distanceToTarget1 >= 0 && distanceToTarget1 <= atr * 0.25;

  const nearTarget1 = target1Hit || targetProgressPercent >= 80 || nearByAtr;

  const reasons: string[] = [];
  let reversalScore = 0;
  let holdScore = 0;

  if (nearTarget1 && !target1Hit) {
    reasons.push('Price is near Target 1; watch for rejection.');
  }

  if (target1Hit) {
    reasons.push('Target 1 is hit or crossed.');
  }

  if (!latest) {
    return {
      targetProgressPercent,
      target1Hit,
      nearTarget1,
      reversalRisk: nearTarget1 ? 'MEDIUM' : 'LOW',
      holdToTarget2Confidence: 'LOW',
      suggestedAction:
        currentR >= 0.7 ? 'MOVE_SL_TO_COST' : nearTarget1 ? 'BOOK_PARTIAL' : 'HOLD',
      reasons: [
        ...reasons,
        'Waiting for recent candle data to confirm reversal or continuation.',
      ],
    };
  }

  const candleRange = Math.max(latest.high - latest.low, 0.01);
  const candleBody = Math.abs(latest.close - latest.open);
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const closePosition = (latest.close - latest.low) / candleRange;
  const volumeSpike =
    averageVolume20 > 0 && Number(latest.volume || 0) > averageVolume20 * 1.2;

  const hasBuyRejection =
    upperWick / candleRange >= 0.4 &&
    upperWick > candleBody &&
    closePosition <= 0.55;

  const hasSellRejection =
    lowerWick / candleRange >= 0.4 &&
    lowerWick > candleBody &&
    closePosition >= 0.45;

  const failedTargetClose = isBuy
    ? latest.high >= signal.target1 && latest.close < signal.target1
    : latest.low <= signal.target1 && latest.close > signal.target1;

  const closedBeyondTarget1 = isBuy
    ? latest.close >= signal.target1
    : latest.close <= signal.target1;

  const priceHoldingTrend = isBuy
    ? latest.close >= ema20 && latest.close >= vwap
    : latest.close <= ema20 && latest.close <= vwap;

  const rsiTurningAgainst = isBuy
    ? rsi.latest < rsi.previous && rsi.latest >= 60
    : rsi.latest > rsi.previous && rsi.latest <= 40;

  const rsiHealthyForContinuation = isBuy
    ? rsi.latest >= 45 && rsi.latest <= 72 && rsi.latest >= rsi.previous - 3
    : rsi.latest >= 28 && rsi.latest <= 55 && rsi.latest <= rsi.previous + 3;

  if (nearTarget1) {
    if (isBuy && hasBuyRejection) {
      reversalScore += 2;
      reasons.push('Latest candle shows upper-wick rejection near target.');
    }

    if (!isBuy && hasSellRejection) {
      reversalScore += 2;
      reasons.push('Latest candle shows lower-wick rejection near target.');
    }

    if (failedTargetClose) {
      reversalScore += 2;
      reasons.push('Price tested Target 1 but failed to close beyond it.');
    }

    if (rsiTurningAgainst) {
      reversalScore += 1;
      reasons.push('RSI is turning against the trade near target.');
    }

    if (volumeSpike && (hasBuyRejection || hasSellRejection || failedTargetClose)) {
      reversalScore += 1;
      reasons.push('Volume spike came with rejection; reversal risk is higher.');
    }
  }

  if (target1Hit && closedBeyondTarget1) {
    holdScore += 1;
    reasons.push('Price closed beyond Target 1.');
  }

  if (priceHoldingTrend) {
    holdScore += 1;
    reasons.push(
      isBuy
        ? 'Price is holding above EMA20/VWAP.'
        : 'Price is holding below EMA20/VWAP.'
    );
  }

  if (volumeSpike && closedBeyondTarget1) {
    holdScore += 1;
    reasons.push('Move beyond Target 1 has volume support.');
  }

  if (rsiHealthyForContinuation) {
    holdScore += 1;
    reasons.push('RSI is still healthy for continuation.');
  }

  if (
    (isBuy && !hasBuyRejection) ||
    (!isBuy && !hasSellRejection)
  ) {
    holdScore += 1;
    reasons.push('No major rejection wick on latest candle.');
  }

  if (nearTarget1 && reversalScore === 0) {
    reasons.push('No strong reversal warning near Target 1 yet.');
  }

  const reversalRisk = getRiskLabel(reversalScore);
  const holdToTarget2Confidence = getConfidenceLabel(holdScore);
  const suggestedAction = actionFromAnalysis({
    target1Hit,
    nearTarget1,
    currentR,
    reversalRisk,
    holdToTarget2Confidence,
  });

  return {
    targetProgressPercent,
    target1Hit,
    nearTarget1,
    reversalRisk,
    holdToTarget2Confidence,
    suggestedAction,
    reasons: reasons.slice(0, 6),
  };
}
