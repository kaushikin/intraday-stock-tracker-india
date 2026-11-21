import type { CandleData, PriceData } from '@/contexts/AppContext';
import { CHARGE_SCHEDULE } from './brokerCharges';
import { CASH_3R_RULES, evaluateCash3RPlan } from './cashPlan';
import {
  findScanner3RSetup,
  SCANNER_3R_VERSION,
  type PaperSetup,
} from './paperStrategy';
import { quoteProblem, BAR_MS } from './marketDataQuality';
import { isFreshSignalWindowOpenIST, istDateKey } from './marketHours';
import {
  validateScanConfig,
  type ScanConfig,
  type ScanPlan,
  type ScanResult,
} from './niftyScanner';

export const SCANNER_3R_SCREEN_VERSION = 'nifty50-cash-screen-v2-3r';
export const DEFAULT_SCAN_CONFIG_3R: ScanConfig = {
  riskBudget: 50,
  cash: 9500,
  slippage: 5,
  roundingReserve: 1,
  extraCharges: 0,
};
export function validateScanConfig3R(config: ScanConfig) {
  validateScanConfig(config);
  if (
    config.slippage < CASH_3R_RULES.minExecutionReserve ||
    config.roundingReserve < CASH_3R_RULES.minRoundingReserve
  )
    throw new Error(
      'Scanner 3R requires at least ₹5 execution reserve and ₹1 tax-rounding reserve. Increase them when actual costs require.'
    );
}

export function sizeScanner3RSetup(
  setup: PaperSetup,
  quote: PriceData,
  config: ScanConfig,
  now = new Date(),
  chargeSchedule: string = CHARGE_SCHEDULE.id
): { plan?: ScanPlan; reasons: string[] } {
  validateScanConfig3R(config);
  const reasons: string[] = [];
  const problem = quoteProblem(quote, now);
  if (problem) reasons.push(problem);
  const entry = quote.ask || 0,
    bid = quote.bid || 0;
  const distance = setup.entry - setup.stop;
  const target = Math.round((setup.entry + 3 * distance) * 10000) / 10000;
  if (
    setup.version !== SCANNER_3R_VERSION ||
    setup.side !== 'BUY' ||
    setup.id !== `${SCANNER_3R_VERSION}:${setup.symbol}:${setup.barTime}` ||
    ![setup.entry, setup.stop, setup.target, distance, setup.tickSize].every(
      (n) => Number.isFinite(n) && n > 0
    ) ||
    Math.abs(setup.target - target) > 1e-8 ||
    [setup.entry, setup.stop].some(
      (p) =>
        Math.abs(p / setup.tickSize - Math.round(p / setup.tickSize)) > 1e-6
    )
  )
    reasons.push(
      'Invalid 3R setup: target must stay fixed to the original trigger and chart stop.'
    );
  if (!isFreshSignalWindowOpenIST(now))
    reasons.push('Outside the 09:45–11:15 IST research entry window.');
  if (
    !Number.isFinite(Date.parse(setup.barTime)) ||
    Date.parse(setup.createdAt) !== Date.parse(setup.barTime) + BAR_MS ||
    Date.parse(setup.expiresAt) !== Date.parse(setup.createdAt) + 2 * BAR_MS ||
    now.getTime() >= Date.parse(setup.expiresAt) ||
    now.getTime() < Date.parse(setup.createdAt) ||
    istDateKey(new Date(setup.createdAt)) !== istDateKey(now)
  )
    reasons.push('Setup expired or not yet valid.');
  if (
    quote.instrumentAsOf !== istDateKey(now) ||
    quote.tickSize !== setup.tickSize
  )
    reasons.push('Current instrument metadata is missing or changed.');
  if (![entry, bid].every((n) => Number.isFinite(n) && n > 0) || entry < bid)
    reasons.push('Executable bid/ask unavailable.');
  if (entry < setup.entry) reasons.push('Waiting for the entry trigger.');
  if (entry > setup.entry + distance * 0.1 || entry >= setup.target)
    reasons.push('Price has moved too far beyond the trigger. Do not chase.');
  if (entry - bid > distance * 0.1)
    reasons.push('Spread exceeds 10% of the setup stop distance.');
  if (!Number.isFinite(quote.askQuantity) || Number(quote.askQuantity) < 1)
    reasons.push('Ask depth unavailable.');
  if (reasons.length) return { reasons };
  const upper = Math.floor(
    Math.min(
      config.cash / entry,
      config.riskBudget / (entry - setup.stop),
      CASH_3R_RULES.maxPositionValue / entry,
      Number(quote.askQuantity)
    )
  );
  if (!Number.isSafeInteger(upper) || upper > 100000)
    return {
      reasons: [
        'Price/quantity is outside the supported cash screening range.',
      ],
    };
  let nearest: ScanPlan | undefined;
  for (let quantity = upper; quantity >= 1; quantity--) {
    const scenario = evaluateCash3RPlan({
      entry,
      trigger: setup.entry,
      stop: setup.stop,
      quantity,
      spread: entry - bid,
      tickSize: setup.tickSize,
      measuredSlippage: config.slippage,
      roundingReserve: config.roundingReserve,
      extraCharges: config.extraCharges,
      riskBudget: config.riskBudget,
      cash: config.cash,
      chargeSchedule,
    });
    const { costFeasible, ...plan } = scenario;
    const result: ScanPlan = { ...plan, spread: entry - bid };
    if (
      !nearest &&
      scenario.risk <= config.riskBudget &&
      scenario.cashRequired <= config.cash
    )
      nearest = result;
    if (costFeasible) return { plan: result, reasons: [] };
  }
  return {
    plan: nearest,
    reasons: nearest
      ? nearest.reasons
      : [
          'No whole-share quantity fits the ₹50 risk, cash, ₹5,000 position limit, depth and full costs.',
        ],
  };
}

export function screenScanner3R(
  symbol: string,
  quote: PriceData | undefined,
  candles: CandleData[],
  index: CandleData[],
  config: ScanConfig,
  now = new Date(),
  feedErrors: string[] = []
): ScanResult {
  validateScanConfig3R(config);
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
  const decision = findScanner3RSetup(symbol, candles, index, quote, now);
  if (!decision.setup)
    return {
      ...base,
      status: decision.dataReady ? 'WATCH' : 'UNAVAILABLE',
      reasons: decision.reasons,
    };
  const sized = sizeScanner3RSetup(decision.setup, quote!, config, now);
  return {
    ...base,
    setup: decision.setup,
    ...sized,
    status:
      sized.plan?.eligible && !sized.reasons.length ? 'SHORTLIST' : 'WATCH',
  };
}
