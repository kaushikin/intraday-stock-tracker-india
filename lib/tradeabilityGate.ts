export type TradeabilityStatus = 'TRADABLE' | 'WATCH_ONLY';

// Was 1.15 -- mathematically unreachable under the current Target 1 =
// risk x 1.3 formula (real ceiling is ~1.09). Moved to 1.04 to match the
// new ACCEPTABLE quality floor in lib/positionSizing.ts. See bug report
// 2026-07-10.
export const MIN_TRADABLE_NET_RR = 1.04;

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
