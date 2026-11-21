import { cashCostScenario, CHARGE_SCHEDULE } from './brokerCharges';
import { SCANNER_3R_VERSION } from './paperStrategy';

// Active scanner 3R cost rules. Practice and historical scanner sizing stay separate.
export const CASH_3R_RULES = Object.freeze({
  version: SCANNER_3R_VERSION,
  maxRisk: 50,
  cash: 9500,
  maxPositionValue: 5000,
  grossTargetR: 3,
  minExecutionReserve: 5,
  minRoundingReserve: 1,
  maxSpreadFraction: 0.1,
  maxExecutionFraction: 0.25,
});

export function evaluateCash3RPlan(input: {
  entry: number;
  trigger?: number;
  chargeSchedule?: string;
  stop: number;
  quantity: number;
  spread: number;
  tickSize: number;
  measuredSlippage?: number;
  extraCharges?: number;
  roundingReserve?: number;
  riskBudget?: number;
  cash?: number;
}) {
  const r = CASH_3R_RULES;
  const {
    entry,
    trigger = entry,
    chargeSchedule = CHARGE_SCHEDULE.id,
    stop,
    quantity,
    spread,
    tickSize,
    measuredSlippage = 0,
    extraCharges = 0,
    roundingReserve = r.minRoundingReserve,
    riskBudget = r.maxRisk,
    cash = r.cash,
  } = input;
  if (
    ![
      entry,
      trigger,
      stop,
      spread,
      tickSize,
      measuredSlippage,
      extraCharges,
      roundingReserve,
      riskBudget,
      cash,
    ].every(Number.isFinite) ||
    !(
      entry >= trigger &&
      trigger > stop &&
      stop > 0 &&
      tickSize > 0 &&
      spread >= 0
    ) ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > 100000 ||
    measuredSlippage < 0 ||
    extraCharges < 0 ||
    roundingReserve < 0 ||
    riskBudget <= 0 ||
    riskBudget > r.maxRisk ||
    cash <= 0 ||
    cash > r.cash
  )
    throw new Error(
      'Use positive cash-share levels, whole shares, non-negative costs, risk up to ₹50 and cash up to ₹9,500.'
    );
  const distance = trigger - stop;
  const target =
    Math.round(
      Math.ceil((trigger + r.grossTargetR * distance) / tickSize - 1e-8) *
        tickSize *
        10000
    ) / 10000;
  const executionReserve = Math.max(
    r.minExecutionReserve,
    2 * quantity * spread,
    2 * quantity * tickSize,
    measuredSlippage
  );
  const taxReserve = Math.max(r.minRoundingReserve, roundingReserve);
  const scenario = cashCostScenario({
    entry,
    stop,
    target,
    quantity,
    slippage: executionReserve,
    roundingReserve: taxReserve + extraCharges,
    riskBudget,
    cash,
    chargeSchedule,
  });
  const reasons = [...scenario.reasons];
  if (quantity * entry > r.maxPositionValue + 1e-8)
    reasons.push('Position value exceeds the ₹5,000 ceiling.');
  if (spread > distance * r.maxSpreadFraction + 1e-8)
    reasons.push('Observed spread exceeds 10% of the chart stop distance.');
  if (
    quantity * spread + executionReserve >
    quantity * distance * r.maxExecutionFraction + 1e-8
  )
    reasons.push(
      'Spread cost plus execution reserve exceeds 25% of gross stop risk.'
    );
  return {
    entry,
    stop,
    target,
    quantity,
    executionReserve,
    taxReserve,
    ...scenario,
    eligible: reasons.length === 0,
    reasons,
    costFeasible: reasons.length === 0,
  };
}
