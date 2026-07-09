export type PositionSizingInput = {
  side: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  target: number;
  maxRiskAmount: number;
  estimatedCharges: number;
};

export type PositionSizingResult = {
  riskPerShare: number;
  rewardPerShare: number;
  suggestedQuantity: number;
  grossProfitAtTarget: number;
  grossLossAtStop: number;
  estimatedCharges: number;
  netProfitAtTarget: number;
  netLossAtStop: number;
  grossRiskReward: number;
  netRiskReward: number;
  quality: 'GOOD' | 'ACCEPTABLE' | 'WEAK' | 'AVOID';
  warnings: string[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculatePositionSizing(
  input: PositionSizingInput
): PositionSizingResult {
  const entry = Number(input.entry || 0);
  const stopLoss = Number(input.stopLoss || 0);
  const target = Number(input.target || 0);
  const maxRiskAmount = Math.max(Number(input.maxRiskAmount || 0), 0);
  const estimatedCharges = Math.max(Number(input.estimatedCharges || 0), 0);

  const riskPerShare =
    input.side === 'BUY' ? entry - stopLoss : stopLoss - entry;

  const rewardPerShare =
    input.side === 'BUY' ? target - entry : entry - target;

  const safeRiskPerShare = Math.max(riskPerShare, 0);
  const safeRewardPerShare = Math.max(rewardPerShare, 0);

  const suggestedQuantity =
    safeRiskPerShare > 0 && maxRiskAmount > 0
      ? Math.floor(maxRiskAmount / safeRiskPerShare)
      : 0;

  const grossProfitAtTarget = suggestedQuantity * safeRewardPerShare;
  const grossLossAtStop = suggestedQuantity * safeRiskPerShare;

  const netProfitAtTarget = grossProfitAtTarget - estimatedCharges;
  const netLossAtStop = grossLossAtStop + estimatedCharges;

  const grossRiskReward =
    safeRiskPerShare > 0 ? safeRewardPerShare / safeRiskPerShare : 0;

  const netRiskReward =
    netLossAtStop > 0 ? netProfitAtTarget / netLossAtStop : 0;

  const warnings: string[] = [];

  if (safeRiskPerShare <= 0) {
    warnings.push('Invalid stop loss: risk per share is zero or negative');
  }

  if (safeRewardPerShare <= 0) {
    warnings.push('Invalid target: reward per share is zero or negative');
  }

  if (suggestedQuantity <= 0) {
    warnings.push('Suggested quantity is zero based on max risk');
  }

  if (grossRiskReward < 1) {
    warnings.push('Gross risk-reward is below 1:1');
  }

  if (grossRiskReward < 1.2) {
    warnings.push('Gross risk-reward is weak for intraday');
  }

  if (netProfitAtTarget <= 0) {
    warnings.push('Estimated charges may make target unprofitable');
  }

  if (netRiskReward < 1) {
    warnings.push('Net risk-reward after charges is below 1:1');
  }

  // Thresholds recalibrated to the range that is actually achievable under
  // the current Target 1 = risk x 1.3 formula. Simulating netRiskReward
  // across realistic risk-per-share values shows a theoretical ceiling of
  // ~1.0909 (as risk/share -> 0) and realistic outcomes clustering between
  // ~1.04 (very high-price stocks with coarse quantity rounding, e.g.
  // risk/share=200 -> 1.044) and ~1.09 (most normal-priced stocks, e.g.
  // risk/share=6.44 -> 1.0893). The old thresholds (WEAK < 1.2,
  // ACCEPTABLE < 1.5, GOOD >= 1.5) sat entirely above this ceiling, so
  // every signal ever generated was permanently mislabeled WEAK regardless
  // of technical quality. See bug report 2026-07-10.
  let quality: PositionSizingResult['quality'] = 'GOOD';

  if (netRiskReward < 1 || netProfitAtTarget <= 0) {
    quality = 'AVOID';
  } else if (netRiskReward < 1.04) {
    quality = 'WEAK';
  } else if (netRiskReward < 1.075) {
    quality = 'ACCEPTABLE';
  }

  return {
    riskPerShare: round2(safeRiskPerShare),
    rewardPerShare: round2(safeRewardPerShare),
    suggestedQuantity,
    grossProfitAtTarget: round2(grossProfitAtTarget),
    grossLossAtStop: round2(grossLossAtStop),
    estimatedCharges: round2(estimatedCharges),
    netProfitAtTarget: round2(netProfitAtTarget),
    netLossAtStop: round2(netLossAtStop),
    grossRiskReward: round2(grossRiskReward),
    netRiskReward: round2(netRiskReward),
    quality,
    warnings,
  };
}
