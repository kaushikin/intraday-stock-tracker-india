export type TradeabilityStatus = 'TRADABLE' | 'WATCH_ONLY';

export const MIN_TRADABLE_NET_RR = 1.15;

export type TradeabilityInput = {
  quality: 'GOOD' | 'ACCEPTABLE' | 'WEAK' | 'AVOID';
  strength: 'STRONG' | 'MEDIUM' | 'WEAK';
  netRiskReward: number;
};

export type TradeabilityResult = {
  status: TradeabilityStatus;
  reasons: string[];
};

export function evaluateTradeability({
  quality,
  strength,
  netRiskReward,
}: TradeabilityInput): TradeabilityResult {
  const reasons: string[] = [];

  const qualityOk = quality === 'GOOD' || quality === 'ACCEPTABLE';
  const strengthOk = strength === 'STRONG';
  const netRROk = netRiskReward >= MIN_TRADABLE_NET_RR;

  if (!qualityOk) {
    reasons.push(`Quality is ${quality}`);
  }

  if (!strengthOk) {
    reasons.push(`Signal strength is ${strength}, not STRONG`);
  }

  if (!netRROk) {
    reasons.push(
      `Net R:R ${netRiskReward.toFixed(2)} is below required ${MIN_TRADABLE_NET_RR}`
    );
  }

  const status: TradeabilityStatus =
    qualityOk && strengthOk && netRROk ? 'TRADABLE' : 'WATCH_ONLY';

  return { status, reasons };
}
