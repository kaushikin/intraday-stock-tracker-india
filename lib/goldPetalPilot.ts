import { istDateKey, getISTMinutes } from './marketHours';
import {
  petalCandleProblem,
  petalQuoteProblem,
  petalContractProblem,
  petalSessionProblem,
  type PetalFeed,
  type PetalBar,
} from './goldPetalMarket';
export const PETAL_BOOK_KEY = 'gold_petal_paper_pilot_v1';
export const PETAL_VERSION = 'gold-petal-breakout-paper-v1';
export const PETAL_RULES = Object.freeze({
  capital: 30000,
  maxRisk: 150,
  dailyLoss: 250,
  maxTrades: 1,
  quantity: 1,
  minNetRR: 2,
  entrySlippage: 5,
  exitSlippage: 5,
  roundingReserve: 2,
  maxSpread: 3,
  timeMinutes: 30,
});
export const PETAL_FEES = {
  id: 'angel-mcx-futures-2026-11-23',
  source: 'https://www.angelone.in/exchange-transaction-charges',
} as const;
const money = (v: number) => Math.round(v * 100) / 100;
const up = (v: number) => Math.max(0, Math.ceil(v * 100 - 1e-8) / 100);
const positive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonnegative = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function petalCharges(entry: number, exit: number) {
  if (!positive(entry) || !positive(exit))
    throw new Error('Positive Gold Petal prices are required.');
  const turnover = entry + exit,
    brokerage = 40,
    exchange = turnover * 0.000021,
    sebi = turnover * 0.000001,
    ctt = exit * 0.0001,
    stamp = entry * 0.00002,
    gst = (brokerage + exchange + sebi) * 0.18;
  return {
    brokerage,
    exchange,
    sebi,
    ctt,
    stamp,
    gst,
    total: up(brokerage + exchange + sebi + ctt + stamp + gst),
  };
}
export type PetalPlan = {
  version: typeof PETAL_VERSION;
  id: string;
  entry: number;
  stop: number;
  target: number;
  atr: number;
  plannedRisk: number;
  feesAtStop: number;
  feesAtTarget: number;
  netReward: number;
  fullFunding: number;
  barTime: string;
};
export type PetalVerification = {
  contract: string;
  barTime: string;
  barClose: number;
  brokerPrice: number;
  brokerTime: string;
  feeAtStop: number;
  feeAtTarget: number;
  reference: string;
  sessionConfirmed: boolean;
  eventChecked: boolean;
};
export type PetalPosition = {
  id: string;
  enteredAt: string;
  plan: PetalPlan;
  feed: PetalFeed;
  verification: PetalVerification;
  otherRiskAtEntry: number;
  alert?: { reason: PetalExitReason; at: string };
  exit?: {
    price: number;
    at: string;
    charges: number;
    reason: PetalExitReason;
    reference: string;
    source: 'APP_BID' | 'BROKER_MANUAL';
    net: number;
  };
};
export type PetalExitReason =
  | 'STOP'
  | 'TARGET'
  | 'TIME'
  | 'DAILY_LIMIT'
  | 'TRADE_RISK'
  | 'DATA_GAP'
  | 'MANUAL';
const exitReasons: PetalExitReason[] = [
  'STOP',
  'TARGET',
  'TIME',
  'DAILY_LIMIT',
  'TRADE_RISK',
  'DATA_GAP',
  'MANUAL',
];
export type PetalBook = {
  kind: 'GOLD_PETAL_PAPER';
  version: 1;
  positions: PetalPosition[];
  declarations: Record<string, { amount: number; at: string }>;
};
export const emptyPetalBook = (): PetalBook => ({
  kind: 'GOLD_PETAL_PAPER',
  version: 1,
  positions: [],
  declarations: {},
});

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  return values.reduce((v, p, i) => (i ? p * k + v * (1 - k) : p), 0);
}
export function planPetal(
  feed: PetalFeed,
  now: Date,
  feeFloor = { stop: 0, target: 0 }
): { plan?: PetalPlan; issues: string[] } {
  const issues: string[] = [];
  const fail = (m: string | null) => {
    if (m) issues.push(m);
  };
  fail(petalSessionProblem(now));
  if (!feed.contract)
    issues.push('Current Gold Petal contract is unavailable.');
  else fail(petalContractProblem(feed.contract, now));
  fail(petalQuoteProblem(feed.quote, now));
  fail(petalCandleProblem(feed.candles, now));
  if (feed.errors.length) issues.push(...feed.errors);
  if (issues.length || !feed.contract || !feed.quote) return { issues };
  if (!nonnegative(feeFloor.stop) || !nonnegative(feeFloor.target))
    return { issues: ['Fee checks must be positive numbers.'] };
  const q = feed.quote,
    bars = feed.candles.slice(-50),
    last = bars[bars.length - 1],
    closes = bars.map((b) => b.close);
  const prior = bars.slice(-21, -1),
    breakout = Math.max(...prior.map((b) => b.high));
  const ranges = bars
    .slice(-14)
    .map((b, i) =>
      Math.max(
        b.high - b.low,
        Math.abs(b.high - bars[bars.length - 15 + i].close),
        Math.abs(b.low - bars[bars.length - 15 + i].close)
      )
    );
  const atr = ranges.reduce((a, b) => a + b, 0) / 14;
  if (q.ask - q.bid > PETAL_RULES.maxSpread)
    issues.push('Bid/ask spread exceeds ₹3 per gram.');
  if (last.close <= breakout)
    issues.push('No completed 20-bar upside breakout.');
  if (ema(closes, 20) <= ema(closes, 50) || last.close <= ema(closes, 20))
    issues.push('The completed-bar trend filter is not positive.');
  if (
    last.volume <= 0 ||
    last.volume < (prior.reduce((a, b) => a + b.volume, 0) / 20) * 1.2
  )
    issues.push('Breakout volume is below 1.2× the prior 20-bar average.');
  if (atr <= 0) issues.push('ATR cannot define a meaningful stop.');
  if (q.ask < breakout + 1 || q.ask > last.close + Math.max(1, atr * 0.25))
    issues.push(
      'Price has fallen below the breakout or moved too far to chase.'
    );
  const entry = q.ask + PETAL_RULES.entrySlippage;
  const stop = Math.floor(
    Math.min(
      Math.min(...bars.slice(-3).map((b) => b.low)) - 1,
      last.close - atr
    )
  );
  if (stop <= PETAL_RULES.exitSlippage || stop >= entry)
    return { issues: [...issues, 'A valid structural stop is unavailable.'] };
  // Reserve the larger verified/model fee at either exit. The same reserve is
  // used at admission and closing, so high target fees cannot hide stop risk.
  let feeReserve = Math.max(
    petalCharges(entry, stop - PETAL_RULES.exitSlippage).total,
    feeFloor.stop,
    feeFloor.target
  );
  let plannedRisk = 0,
    target = 0;
  for (let i = 0; i < 20; i++) {
    plannedRisk = up(
      entry -
        stop +
        PETAL_RULES.exitSlippage +
        feeReserve +
        PETAL_RULES.roundingReserve
    );
    target = Math.ceil(
      entry +
        2 * plannedRisk +
        PETAL_RULES.exitSlippage +
        feeReserve +
        PETAL_RULES.roundingReserve
    );
    const revised = Math.max(
      feeReserve,
      petalCharges(entry, target - PETAL_RULES.exitSlippage).total
    );
    if (revised === feeReserve) break;
    feeReserve = revised;
  }
  const feesAtStop = feeReserve,
    feesAtTarget = feeReserve;
  const netReward = money(
    target -
      PETAL_RULES.exitSlippage -
      entry -
      feesAtTarget -
      PETAL_RULES.roundingReserve
  );
  const fullFunding = up(
    entry +
      Math.max(feesAtStop, feesAtTarget) +
      PETAL_RULES.exitSlippage +
      PETAL_RULES.roundingReserve
  );
  if (plannedRisk > PETAL_RULES.maxRisk)
    issues.push(
      `Stop plus realistic costs needs ₹${plannedRisk.toFixed(2)}, above ₹150. Do not tighten the stop to fit.`
    );
  if (fullFunding > PETAL_RULES.capital)
    issues.push(
      'Full one-lot funding plus costs exceeds ₹30,000; margin funding is not allowed.'
    );
  const plan: PetalPlan = {
    version: PETAL_VERSION,
    id: `${feed.contract.symbol}:${last.time}`,
    entry,
    stop,
    target,
    atr,
    plannedRisk,
    feesAtStop,
    feesAtTarget,
    netReward,
    fullFunding,
    barTime: last.time,
  };
  return { plan, issues };
}
export function petalDailyLoss(book: PetalBook, now: Date) {
  return money(
    book.positions
      .filter(
        (p) => p.exit && istDateKey(new Date(p.exit.at)) === istDateKey(now)
      )
      .reduce((sum, p) => sum + Math.max(0, -p.exit!.net), 0)
  );
}
export function petalEquity(book: PetalBook) {
  return money(
    PETAL_RULES.capital +
      book.positions.reduce((s, p) => s + (p.exit?.net || 0), 0)
  );
}
export type OtherPaperRisk = {
  loss: number;
  openRisk: number;
  openCount: number;
};
export function otherPaperRisk(
  positions: {
    enteredAt: string;
    plannedRisk: number;
    exitedAt?: string;
    entry: number;
    exit?: number;
    quantity: number;
    charges?: number;
  }[],
  now: Date
): OtherPaperRisk {
  let loss = 0,
    openRisk = 0,
    openCount = 0;
  for (const p of positions) {
    if (p.exitedAt) {
      if (istDateKey(new Date(p.exitedAt)) === istDateKey(now))
        loss += Math.max(0, -((p.exit! - p.entry) * p.quantity - p.charges!));
    } else {
      openRisk += p.plannedRisk;
      openCount++;
    }
  }
  if (![loss, openRisk].every(nonnegative))
    throw new Error(
      'Existing paper risk is unreadable; pilot entries remain blocked.'
    );
  return { loss: up(loss), openRisk: up(openRisk), openCount };
}
export function petalBudget(book: PetalBook, other: OtherPaperRisk, now: Date) {
  const declaration = book.declarations[istDateKey(now)];
  const used = up(
    petalDailyLoss(book, now) +
      other.loss +
      other.openRisk +
      (declaration?.amount || 0)
  );
  const reserved = book.positions
    .filter((p) => !p.exit)
    .reduce((s, p) => s + p.plan.plannedRisk, 0);
  return {
    declared: !!declaration,
    used,
    remaining: Math.max(0, money(PETAL_RULES.dailyLoss - used - reserved)),
    reserved,
  };
}
export function verificationProblems(
  v: PetalVerification,
  feed: PetalFeed,
  plan: PetalPlan,
  now: Date
) {
  const issues: string[] = [];
  const bar = feed.candles.at(-1),
    q = feed.quote;
  if (
    v.contract !== feed.contract?.symbol ||
    v.barTime !== bar?.time ||
    v.barClose !== bar?.close
  )
    issues.push(
      'Angel contract, completed-bar time and close must match exactly.'
    );
  const t = Date.parse(v.brokerTime);
  if (
    !q ||
    !positive(v.brokerPrice) ||
    !Number.isFinite(t) ||
    t > now.getTime() + 5000 ||
    now.getTime() - t > 30000 ||
    Math.abs(t - Date.parse(q.exchangeTime)) > 30000 ||
    Math.abs(v.brokerPrice - q.price) > 1
  )
    issues.push(
      'Enter an Angel price/time observed within 30 seconds and within ₹1 of this quote.'
    );
  if (
    !positive(v.feeAtStop) ||
    !positive(v.feeAtTarget) ||
    v.feeAtStop <
      petalCharges(plan.entry, plan.stop - PETAL_RULES.exitSlippage).total ||
    v.feeAtTarget <
      petalCharges(plan.entry, plan.target - PETAL_RULES.exitSlippage).total ||
    !v.reference.trim()
  )
    issues.push(
      'Verify full round-trip fees at stop and target using Angel; lower-than-model costs are not accepted.'
    );
  if (!v.sessionConfirmed || !v.eventChecked)
    issues.push(
      'Confirm the MCX session, tender dates and scheduled event checks.'
    );
  return issues;
}
export function openPetal(
  book: PetalBook,
  feed: PetalFeed,
  v: PetalVerification,
  other: OtherPaperRisk,
  now = new Date()
): PetalBook {
  const { plan, issues } = planPetal(feed, now, {
    stop: v.feeAtStop,
    target: v.feeAtTarget,
  });
  if (!plan || issues.length)
    throw new Error(issues.join(' ') || 'No qualifying paper setup.');
  const check = verificationProblems(v, feed, plan, now);
  if (check.length) throw new Error(check.join(' '));
  const budget = petalBudget(book, other, now);
  if (!budget.declared)
    throw new Error(
      'Declare losses and open risk outside these two journals for today, including zero.'
    );
  if (book.positions.some((p) => !p.exit) || other.openCount > 0)
    throw new Error(
      'Close existing paper positions before starting the one-position commodity pilot.'
    );
  if (
    book.positions.some(
      (p) => istDateKey(new Date(p.enteredAt)) === istDateKey(now)
    )
  )
    throw new Error('This pilot permits at most one entry per IST day.');
  if (plan.plannedRisk > budget.remaining)
    throw new Error('Insufficient remaining ₹250 daily loss allowance.');
  if (plan.fullFunding > petalEquity(book))
    throw new Error('Full one-lot funding exceeds the remaining paper equity.');
  return {
    ...book,
    positions: [
      ...book.positions,
      {
        id: plan.id,
        enteredAt: now.toISOString(),
        plan,
        feed,
        verification: v,
        otherRiskAtEntry: budget.used,
      },
    ],
  };
}
export function petalExitAlert(
  p: PetalPosition,
  feed: PetalFeed | null,
  otherUsed: number,
  now: Date
): { reason?: PetalExitReason; message: string } {
  if (p.exit) return { message: 'Closed paper position.' };
  if (p.alert)
    return {
      reason: p.alert.reason,
      message: `${p.alert.reason} exit was flagged at ${p.alert.at}. Review and record the paper exit.`,
    };
  if (
    istDateKey(new Date(p.enteredAt)) !== istDateKey(now) ||
    now.getTime() - Date.parse(p.enteredAt) >=
      PETAL_RULES.timeMinutes * 60000 ||
    getISTMinutes(now) >= 22 * 60
  )
    return {
      reason: 'TIME',
      message:
        'Time exit due: 30 minutes, 22:00 IST or session rollover. Record the actual paper exit; no fill has been assumed.',
    };
  if (
    !feed ||
    feed.contract?.symbol !== p.feed.contract?.symbol ||
    feed.contract?.token !== p.feed.contract?.token ||
    petalQuoteProblem(feed.quote, now)
  )
    return {
      message:
        'Exit monitoring unavailable: refresh the saved contract or record a verified manual paper exit.',
    };
  const q = feed.quote!;
  const seen = feed.candles.filter(
    (b) => Date.parse(b.time) >= Date.parse(p.enteredAt)
  );
  if (q.bid <= p.plan.stop || seen.some((b) => b.low <= p.plan.stop))
    return {
      reason: 'STOP',
      message:
        'Stop touched or crossed. Review the current bid and record the paper exit; gaps are not capped at the stop.',
    };
  const risk = Math.max(
    0,
    p.plan.entry -
      (q.bid - PETAL_RULES.exitSlippage) +
      Math.max(
        petalCharges(
          p.plan.entry,
          Math.max(1, q.bid - PETAL_RULES.exitSlippage)
        ).total,
        p.plan.feesAtStop,
        p.plan.feesAtTarget
      ) +
      PETAL_RULES.roundingReserve
  );
  if (otherUsed + risk >= PETAL_RULES.dailyLoss)
    return {
      reason: 'DAILY_LIMIT',
      message:
        'Combined daily loss allowance reached. Review the paper exit and stop new entries.',
    };
  if (risk >= PETAL_RULES.maxRisk)
    return {
      reason: 'TRADE_RISK',
      message:
        'Estimated paper loss including costs reached ₹150. Review the paper exit.',
    };
  if (q.bid >= p.plan.target || seen.some((b) => b.high >= p.plan.target))
    return {
      reason: 'TARGET',
      message:
        'Target touched. Verify the current exit price and record the paper result; no historical fill is assumed.',
    };
  return {
    message:
      'No exit trigger observed in available snapshots. Intrabar touches and gaps between checks may be missed.',
  };
}
export function closePetal(
  book: PetalBook,
  id: string,
  input: {
    price: number;
    charges: number;
    reason: PetalExitReason;
    reference: string;
    source: 'APP_BID' | 'BROKER_MANUAL';
  },
  now = new Date()
): PetalBook {
  const p = book.positions.find((x) => x.id === id);
  if (!p || p.exit) throw new Error('No open Gold Petal paper position.');
  if (
    !positive(input.price) ||
    !Number.isInteger(input.price) ||
    !nonnegative(input.charges) ||
    !exitReasons.includes(input.reason) ||
    !['APP_BID', 'BROKER_MANUAL'].includes(input.source) ||
    !input.reference.trim() ||
    Date.parse(p.enteredAt) > now.getTime()
  )
    throw new Error(
      'Enter a valid paper exit price, total charges and verification reference.'
    );
  const floor =
    Math.max(
      petalCharges(p.plan.entry, input.price).total,
      p.plan.feesAtStop,
      p.plan.feesAtTarget
    ) + PETAL_RULES.roundingReserve;
  if (input.charges < floor)
    throw new Error(
      `Keep at least ₹${floor.toFixed(2)} for full fees and rounding reserve.`
    );
  const net = money(input.price - p.plan.entry - input.charges);
  return {
    ...book,
    positions: book.positions.map((x) =>
      x.id !== id ? x : { ...x, exit: { ...input, at: now.toISOString(), net } }
    ),
  };
}
export function closePetalFromQuote(
  book: PetalBook,
  id: string,
  feed: PetalFeed,
  charges: number,
  reason: PetalExitReason,
  now = new Date()
) {
  const p = book.positions.find((x) => x.id === id);
  if (
    !p ||
    feed.contract?.symbol !== p.feed.contract?.symbol ||
    feed.contract?.token !== p.feed.contract?.token ||
    petalQuoteProblem(feed.quote, now)
  )
    throw new Error(
      'Refresh the exact saved contract before using an app-priced exit.'
    );
  return closePetal(
    book,
    id,
    {
      price: Math.max(1, feed.quote!.bid - PETAL_RULES.exitSlippage),
      charges,
      reason,
      source: 'APP_BID',
      reference: `Observed bid ${feed.quote!.bid} at ${feed.quote!.exchangeTime}, less ₹5 exit slippage.`,
    },
    now
  );
}
export function parsePetalBook(raw: string | null): PetalBook {
  if (raw === null) return emptyPetalBook();
  const b = JSON.parse(raw) as PetalBook;
  const invalid = () => {
    throw new Error(
      'Gold Petal pilot data is unreadable. Export the raw backup; nothing has been overwritten.'
    );
  };
  if (
    b?.kind !== 'GOLD_PETAL_PAPER' ||
    b.version !== 1 ||
    !Array.isArray(b.positions) ||
    b.positions.length > 10000 ||
    !b.declarations ||
    Array.isArray(b.declarations) ||
    typeof b.declarations !== 'object'
  )
    invalid();
  const ids = new Set();
  const entryDays = new Set<string>();
  let open = 0;
  for (const p of b.positions) {
    if (
      !p ||
      typeof p.id !== 'string' ||
      ids.has(p.id) ||
      !Number.isFinite(Date.parse(p.enteredAt)) ||
      p.plan?.version !== PETAL_VERSION ||
      p.plan.id !== p.id ||
      !p.feed?.contract ||
      p.feed.kind !== 'GOLD_PETAL_PAPER' ||
      !p.verification ||
      !nonnegative(p.otherRiskAtEntry)
    )
      invalid();
    ids.add(p.id);
    const entryDay = istDateKey(new Date(p.enteredAt));
    if (entryDays.has(entryDay)) invalid();
    entryDays.add(entryDay);
    const rebuilt = planPetal(p.feed, new Date(p.enteredAt), {
      stop: p.verification.feeAtStop,
      target: p.verification.feeAtTarget,
    });
    if (
      rebuilt.issues.length ||
      JSON.stringify(rebuilt.plan) !== JSON.stringify(p.plan) ||
      verificationProblems(
        p.verification,
        p.feed,
        p.plan,
        new Date(p.enteredAt)
      ).length
    )
      invalid();
    if (
      p.alert &&
      (!exitReasons.includes(p.alert.reason) ||
        !Number.isFinite(Date.parse(p.alert.at)) ||
        Date.parse(p.alert.at) < Date.parse(p.enteredAt))
    )
      invalid();
    if (
      [
        p.plan.entry,
        p.plan.stop,
        p.plan.target,
        p.plan.atr,
        p.plan.plannedRisk,
        p.plan.feesAtStop,
        p.plan.feesAtTarget,
        p.plan.fullFunding,
        p.plan.netReward,
      ].some((v) => !positive(v)) ||
      p.plan.stop >= p.plan.entry ||
      p.plan.target <= p.plan.entry ||
      p.plan.plannedRisk > 150 ||
      p.plan.fullFunding > 30000
    )
      invalid();
    if (p.exit) {
      if (
        !positive(p.exit.price) ||
        !nonnegative(p.exit.charges) ||
        !exitReasons.includes(p.exit.reason) ||
        !['APP_BID', 'BROKER_MANUAL'].includes(p.exit.source) ||
        typeof p.exit.reference !== 'string' ||
        !p.exit.reference.trim() ||
        p.exit.charges <
          Math.max(
            petalCharges(p.plan.entry, p.exit.price).total,
            p.plan.feesAtStop,
            p.plan.feesAtTarget
          ) +
            PETAL_RULES.roundingReserve ||
        !Number.isFinite(p.exit.net) ||
        !Number.isFinite(Date.parse(p.exit.at)) ||
        Date.parse(p.exit.at) < Date.parse(p.enteredAt) ||
        Math.abs(
          money(p.exit.price - p.plan.entry - p.exit.charges) - p.exit.net
        ) > 0.001
      )
        invalid();
    } else open++;
  }
  if (open > 1) invalid();
  for (const [day, v] of Object.entries(b.declarations))
    if (
      !/^2026-\d{2}-\d{2}$/.test(day) ||
      !nonnegative(v?.amount) ||
      !Number.isFinite(Date.parse(v.at))
    )
      invalid();
  return b;
}
