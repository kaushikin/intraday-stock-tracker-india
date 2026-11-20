// Published standard Angel One NSE cash intraday tariff, reviewed 2026-11-21.
// This is an estimate for one buy order and one sell order, not an account statement.
export const CHARGE_SCHEDULE = Object.freeze({
  id: 'angel-nse-intraday-2026-11-21',
  reviewedAt: '2026-11-21',
  source: 'https://www.angelone.in/exchange-transaction-charges',
  exchangeSource:
    'https://nsearchives.nseindia.com/content/circulars/FA73061.pdf',
  brokerageRate: 0.001,
  minimumBrokerage: 5,
  maximumBrokerage: 20,
  exchangeRate: 0.000030699,
  ipftRate: 0.000000001,
  sttSellRate: 0.00025,
  stampBuyRate: 0.00003,
  sebiRate: 0.000001,
  gstRate: 0.18,
});
export type ChargeEstimate = {
  brokerage: number;
  exchange: number;
  ipft: number;
  sebi: number;
  stt: number;
  stamp: number;
  gst: number;
  total: number;
};
const round = (n: number) => Math.round(n * 100) / 100;
export function estimateCashCharges(
  entry: number,
  exit: number,
  quantity: number
): ChargeEstimate {
  if (
    ![entry, exit, quantity].every(Number.isFinite) ||
    entry <= 0 ||
    exit <= 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  )
    throw new Error('Enter positive prices and a whole-share quantity.');
  const buy = entry * quantity,
    sell = exit * quantity,
    turnover = buy + sell,
    r = CHARGE_SCHEDULE;
  const brokerage = [buy, sell].reduce(
    (sum, value) =>
      sum +
      Math.max(
        r.minimumBrokerage,
        Math.min(r.maximumBrokerage, value * r.brokerageRate)
      ),
    0
  );
  const exchange = turnover * r.exchangeRate,
    ipft = turnover * r.ipftRate,
    sebi = turnover * r.sebiRate;
  const stt = sell * r.sttSellRate,
    stamp = buy * r.stampBuyRate;
  const gst = (brokerage + exchange + ipft + sebi) * r.gstRate;
  // Keep unrounded line items so small statutory fees are not lost. Round the total upward
  // to a paisa. Contract-note/day-level tax rounding can differ: keep a separate reserve.
  return {
    brokerage,
    exchange,
    ipft,
    sebi,
    stt,
    stamp,
    gst,
    total:
      Math.ceil(
        (brokerage + exchange + ipft + sebi + stt + stamp + gst) * 100 - 1e-8
      ) / 100,
  };
}
export function cashCostScenario(input: {
  entry: number;
  stop: number;
  target: number;
  quantity: number;
  slippage: number;
  roundingReserve: number;
  riskBudget: number;
  cash: number;
}) {
  const {
    entry,
    stop,
    target,
    quantity,
    slippage,
    roundingReserve,
    riskBudget,
    cash,
  } = input;
  if (
    ![slippage, roundingReserve, riskBudget, cash].every(
      (n) => Number.isFinite(n) && n >= 0
    ) ||
    !(stop > 0 && stop < entry && target > entry)
  )
    throw new Error('Check stop, target, costs and budget.');
  const atStop = estimateCashCharges(entry, stop, quantity),
    atTarget = estimateCashCharges(entry, target, quantity);
  const planningCharges =
    Math.ceil(
      (Math.max(atStop.total, atTarget.total) + roundingReserve) * 100 - 1e-8
    ) / 100;
  const risk = quantity * (entry - stop) + planningCharges + slippage;
  const reward = quantity * (target - entry) - planningCharges - slippage;
  const cashRequired = quantity * entry + planningCharges + slippage;
  const netRR = risk > 0 ? reward / risk : 0;
  const reasons: string[] = [];
  if (risk > riskBudget + 1e-8)
    reasons.push('Total planned loss exceeds the remaining risk budget.');
  if (cashRequired > cash + 1e-8)
    reasons.push('Cash required exceeds available unleveraged capital.');
  if (netRR < 1.2)
    reasons.push('Net reward/risk is below the unchanged 1.2 minimum.');
  return {
    atStop,
    atTarget,
    planningCharges,
    risk: round(risk),
    reward: round(reward),
    cashRequired: round(cashRequired),
    netRR,
    eligible: reasons.length === 0,
    reasons,
  };
}
