export type PositionSizingInput = {
  side: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  target: number;
  maxRiskAmount: number;
  estimatedCharges: number;
  slippageAllowance?: number;
  availableCapital?: number;
  lotSize?: number;
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
  const finite = (value: number | undefined, fallback = 0) =>
    Number.isFinite(value) ? Number(value) : fallback;
  const entry = finite(input.entry),
    stopLoss = finite(input.stopLoss),
    target = finite(input.target);
  const maxRiskAmount = Math.max(finite(input.maxRiskAmount), 0);
  const estimatedCharges =
    Math.max(finite(input.estimatedCharges), 0) +
    Math.max(finite(input.slippageAllowance), 0);
  const availableCapital = Math.max(finite(input.availableCapital, 9500), 0);
  const lot = input.lotSize === undefined ? 1 : input.lotSize;
  const valid =
    [
      input.entry,
      input.stopLoss,
      input.target,
      input.maxRiskAmount,
      input.estimatedCharges,
    ].every(Number.isFinite) &&
    entry > 0 &&
    stopLoss > 0 &&
    target > 0 &&
    input.estimatedCharges >= 0 &&
    (input.slippageAllowance === undefined ||
      (Number.isFinite(input.slippageAllowance) &&
        input.slippageAllowance >= 0)) &&
    (input.availableCapital === undefined ||
      (Number.isFinite(input.availableCapital) &&
        input.availableCapital >= 0)) &&
    Number.isInteger(lot) &&
    lot > 0;
  const riskPerShare =
    input.side === 'BUY' ? entry - stopLoss : stopLoss - entry;
  const rewardPerShare = input.side === 'BUY' ? target - entry : entry - target;
  const safeRiskPerShare = Math.max(riskPerShare, 0),
    safeRewardPerShare = Math.max(rewardPerShare, 0);
  const byRisk =
    safeRiskPerShare > 0
      ? Math.max(
          0,
          Math.floor((maxRiskAmount - estimatedCharges) / safeRiskPerShare)
        )
      : 0;
  // Reserve all estimated costs in cash too; this is a cash-equity sizing model.
  const byCash =
    entry > 0
      ? Math.max(0, Math.floor((availableCapital - estimatedCharges) / entry))
      : 0;
  const suggestedQuantity =
    valid && safeRewardPerShare > 0
      ? Math.floor(Math.min(byRisk, byCash) / lot) * lot
      : 0;
  const grossProfitAtTarget = suggestedQuantity * safeRewardPerShare;
  const grossLossAtStop = suggestedQuantity * safeRiskPerShare;
  const netProfitAtTarget = suggestedQuantity
    ? grossProfitAtTarget - estimatedCharges
    : 0;
  const netLossAtStop = suggestedQuantity
    ? grossLossAtStop + estimatedCharges
    : 0;
  const grossRiskReward =
    safeRiskPerShare > 0 ? safeRewardPerShare / safeRiskPerShare : 0;
  const netRiskReward =
    netLossAtStop > 0 ? netProfitAtTarget / netLossAtStop : 0;
  const warnings: string[] = [];
  if (!valid)
    warnings.push(
      'Enter finite positive prices, whole lots and non-negative costs/capital.'
    );
  if (estimatedCharges >= maxRiskAmount)
    warnings.push('Costs consume the entire risk budget.');
  if (byCash < byRisk)
    warnings.push('Quantity limited by available cash; no leverage assumed.');

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

  const quality: PositionSizingResult['quality'] =
    suggestedQuantity <= 0 || netRiskReward < 1
      ? 'AVOID'
      : netRiskReward < 1.2
        ? 'WEAK'
        : netRiskReward < 1.5
          ? 'ACCEPTABLE'
          : 'GOOD';

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
