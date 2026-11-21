import type { CandleData, PriceData } from '@/contexts/AppContext';
import { cashCostScenario, CHARGE_SCHEDULE } from './brokerCharges';
import { findPaperSetup, type PaperSetup } from './paperStrategy';
import { quoteProblem } from './marketDataQuality';
import { isFreshSignalWindowOpenIST, istDateKey } from './marketHours';
export const SCANNER_VERSION = 'nifty50-cash-screen-v1';
export type ScanConfig = {
  riskBudget: number;
  cash: number;
  slippage: number;
  roundingReserve: number;
  extraCharges: number;
};
export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  riskBudget: 50,
  cash: 9500,
  slippage: 1,
  roundingReserve: 0.5,
  extraCharges: 0,
};
export function validateScanConfig(c: ScanConfig) {
  if (
    !c ||
    ![
      c.riskBudget,
      c.cash,
      c.slippage,
      c.roundingReserve,
      c.extraCharges,
    ].every((n) => Number.isFinite(n) && n >= 0) ||
    !(c.riskBudget > 0 && c.riskBudget <= 50 && c.cash > 0 && c.cash <= 9500) ||
    c.slippage > 100 ||
    c.roundingReserve > 100 ||
    c.extraCharges > 100
  )
    throw new Error(
      'Use risk above ₹0 up to ₹50, cash above ₹0 up to ₹9,500 and non-negative cost reserves up to ₹100.'
    );
}
export type ScanPlan = ReturnType<typeof cashCostScenario> & {
  quantity: number;
  entry: number;
  stop: number;
  target: number;
  spread: number;
};
export type ScanResult = {
  symbol: string;
  status: 'SHORTLIST' | 'WATCH' | 'UNAVAILABLE' | 'CLOSED';
  reasons: string[];
  evaluatedAt: string;
  setup?: PaperSetup;
  plan?: ScanPlan;
  exchangeTime?: string;
  candleTime?: string;
};
export function sizeScannerSetup(
  setup: PaperSetup,
  quote: PriceData,
  config: ScanConfig,
  now = new Date(),
  chargeSchedule: string = CHARGE_SCHEDULE.id
): { plan?: ScanPlan; reasons: string[] } {
  validateScanConfig(config);
  const reasons: string[] = [];
  const problem = quoteProblem(quote, now);
  if (problem) reasons.push(problem);
  const entry = quote.ask || 0,
    bid = quote.bid || 0,
    distance = setup.entry - setup.stop;
  if (!isFreshSignalWindowOpenIST(now))
    reasons.push('Outside the 09:45–11:15 IST research entry window.');
  if (
    ![setup.entry, setup.stop, setup.target, distance, setup.tickSize].every(
      (n) => Number.isFinite(n) && n > 0
    ) ||
    setup.target <= setup.entry
  )
    reasons.push('Invalid setup prices.');
  if (
    !Number.isFinite(Date.parse(setup.createdAt)) ||
    !Number.isFinite(Date.parse(setup.expiresAt)) ||
    now.getTime() >= Date.parse(setup.expiresAt) ||
    now.getTime() < Date.parse(setup.createdAt)
  )
    reasons.push('Setup expired or not yet valid.');
  if (
    quote.instrumentAsOf !== istDateKey(now) ||
    quote.tickSize !== setup.tickSize
  )
    reasons.push('Current instrument metadata is missing or changed.');
  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(bid) ||
    entry <= 0 ||
    bid <= 0 ||
    entry < bid
  )
    reasons.push('Executable bid/ask unavailable.');
  if (entry < setup.entry) reasons.push('Waiting for the entry trigger.');
  if (entry > setup.entry + distance * 0.1 || entry >= setup.target)
    reasons.push('Price has moved too far beyond the trigger. Do not chase.');
  if (entry - bid > distance * 0.1)
    reasons.push('Spread exceeds 10% of the setup stop distance.');
  if (!Number.isFinite(quote.askQuantity) || Number(quote.askQuantity) < 1)
    reasons.push('Ask depth unavailable.');
  if (reasons.length) return { reasons };
  // Fees depend on quantity: recompute both stop and target charges for every candidate.
  const upper = Math.floor(
    Math.min(
      config.cash / entry,
      config.riskBudget / (entry - setup.stop),
      Number(quote.askQuantity)
    )
  );
  if (!Number.isSafeInteger(upper) || upper > 100_000)
    return {
      reasons: [
        'Price/quantity is outside the supported cash screening range.',
      ],
    };
  let nearest: ScanPlan | undefined;
  for (let quantity = upper; quantity >= 1; quantity--) {
    const scenario = cashCostScenario({
      entry,
      stop: setup.stop,
      target: setup.target,
      quantity,
      slippage: config.slippage,
      roundingReserve: config.roundingReserve + config.extraCharges,
      riskBudget: config.riskBudget,
      cash: config.cash,
      chargeSchedule,
    });
    const plan = {
      ...scenario,
      quantity,
      entry,
      stop: setup.stop,
      target: setup.target,
      spread: entry - bid,
    };
    if (
      scenario.risk <= config.riskBudget &&
      scenario.cashRequired <= config.cash &&
      !nearest
    )
      nearest = plan;
    if (
      scenario.eligible &&
      entry - bid + config.slippage / quantity <= distance * 0.1 + 1e-9
    )
      return { plan, reasons: [] };
  }
  return {
    plan: nearest,
    reasons: nearest
      ? [
          ...nearest.reasons,
          ...(nearest.spread + config.slippage / nearest.quantity >
          distance * 0.1
            ? ['Spread plus slippage exceeds 10% of the setup stop distance.']
            : []),
        ]
      : [
          'No whole-share quantity fits the risk, cash, depth and estimated charges.',
        ],
  };
}
export function screenCandidate(
  symbol: string,
  quote: PriceData | undefined,
  candles: CandleData[],
  index: CandleData[],
  config: ScanConfig,
  now = new Date(),
  feedErrors: string[] = []
): ScanResult {
  const base = {
    symbol,
    evaluatedAt: now.toISOString(),
    exchangeTime: quote?.exchangeTime,
    candleTime: candles.at(-1)?.time,
  };
  if (feedErrors.length)
    return { ...base, status: 'UNAVAILABLE', reasons: feedErrors };
  if (!isFreshSignalWindowOpenIST(now))
    return {
      ...base,
      status: 'CLOSED',
      reasons: [
        'Outside the 09:45–11:15 IST entry window. Historical data is not a live shortlist.',
      ],
    };
  const decision = findPaperSetup(symbol, candles, index, quote, now);
  if (!decision.setup)
    return {
      ...base,
      status: decision.dataReady ? 'WATCH' : 'UNAVAILABLE',
      reasons: decision.reasons,
    };
  const sized = sizeScannerSetup(decision.setup, quote!, config, now);
  return {
    ...base,
    status:
      sized.plan?.eligible && !sized.reasons.length ? 'SHORTLIST' : 'WATCH',
    setup: decision.setup,
    ...sized,
  };
}
export function rankShortlist(results: ScanResult[]) {
  return results
    .filter((r) => r.status === 'SHORTLIST')
    .sort(
      (a, b) =>
        (b.plan?.netRR || 0) - (a.plan?.netRR || 0) ||
        (a.plan?.spread || 0) - (b.plan?.spread || 0) ||
        a.symbol.localeCompare(b.symbol)
    );
}
