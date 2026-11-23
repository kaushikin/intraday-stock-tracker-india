import type { CommoditySymbol } from './commodityWatch';

// Feasibility review, not an entry/exit strategy or an order-risk engine.
// These are standard futures, not mini contracts or options. Keep cash rules separate.
export const COMMODITY_REVIEW = Object.freeze({
  reviewedAt: '2026-11-23',
  capital: 10000,
  dailyLossCeiling: 250,
  existingTradeRisk: 50,
  brokeragePerOrder: 20,
  gst: 0.18,
  stopTicks: 1,
  entrySlippageTicks: 1,
  exitSlippageTicks: 1,
  tariff: 'https://www.angelone.in/exchange-transaction-charges',
});

export const COMMODITY_SPECS = {
  CRUDEOIL: {
    lot: '100 barrels',
    priceMultiplier: 100,
    tick: 1,
    appliesTo: 'January–December 2026 expiries',
    source:
      'https://www.mcxindia.com/docs/default-source/products/contract-specification/crude-oil/crude-oil-january-2026-contract-onwards267be8c1-650a-4baa-aabd-ffcc9364c100.pdf',
  },
  COPPER: {
    lot: '2,500 kg',
    priceMultiplier: 2500,
    tick: 0.05,
    appliesTo: 'May–December 2026 expiries',
    source:
      'https://www.mcxindia.com/docs/default-source/products/contract-specification/copper/copper-may-2026-contracts-onwards.pdf',
  },
  GOLD: {
    lot: '1 kg',
    priceMultiplier: 100, // Price is quoted per 10 grams, not per gram or kg.
    tick: 1,
    appliesTo: 'August–December 2026 expiries',
    source:
      'https://www.mcxindia.com/docs/default-source/products/contract-specification/gold/gold-august-2026-contract-onwardsd4df534857fb64e3bdfdff00007acb3574ea8ae7-7504-4567-a819-64dc0c700557.pdf',
  },
} as const;

export function commodityRiskFloor(symbol: CommoditySymbol) {
  const spec = COMMODITY_SPECS[symbol];
  const tickValue = spec.tick * spec.priceMultiplier;
  const brokerage = 2 * COMMODITY_REVIEW.brokeragePerOrder;
  const brokerageWithGST =
    Math.round(brokerage * (1 + COMMODITY_REVIEW.gst) * 100) / 100;
  const stopLoss = tickValue * COMMODITY_REVIEW.stopTicks;
  const slippageAllowance =
    tickValue *
    (COMMODITY_REVIEW.entrySlippageTicks + COMMODITY_REVIEW.exitSlippageTicks);
  // Deliberately a lower bound: CTT, stamp, exchange/SEBI fees and their GST
  // are additional. This value must never be used to approve an entry.
  const riskFloor =
    Math.round((stopLoss + slippageAllowance + brokerageWithGST) * 100) / 100;
  return {
    tickValue,
    stopLoss,
    slippageAllowance,
    brokerageWithGST,
    riskFloor,
  };
}

export function commodityAlertReadiness(symbol: CommoditySymbol) {
  const floor = commodityRiskFloor(symbol);
  return {
    ...floor,
    buy: 'BLOCKED' as const,
    exit: 'NOT_MONITORED' as const,
    dailyLimitEnforced: false as const,
    strategyValidated: false as const,
    exceedsDailyCeiling: floor.riskFloor > COMMODITY_REVIEW.dailyLossCeiling,
    reason:
      'Standard-lot risk fails the current plan. Commodity positions and account-wide daily losses are not monitored.',
  };
}
