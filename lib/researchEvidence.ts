import type { CandleData, PriceData } from '@/contexts/AppContext';
import type { PaperBook } from './paperBook';
import { STRATEGY_VERSION } from './paperStrategy';
import { INSTRUMENTS } from './instruments';
import {
  candleProblem,
  completedCandles,
  quoteProblem,
} from './marketDataQuality';
import {
  getISTMinutes,
  isIndianMarketOpen,
  isTradingDayIST,
  istDateKey,
} from './marketHours';
import { CHARGE_SCHEDULE, estimateCashCharges } from './brokerCharges';

export type CandlePrices = Pick<CandleData, 'open' | 'high' | 'low' | 'close'>;
export type ComparisonSnapshot = {
  symbol: string;
  tick: number;
  capturedAt: string;
  exchangeTime: string;
  ltp: number;
  stock: CandleData;
  index: CandleData;
};
export type BrokerObservation = {
  ltp: number;
  quoteTime: string;
  barTime: string;
  stock: CandlePrices & { volume: number };
  index: CandlePrices;
};
export type MarketComparison = {
  id: string;
  at: string;
  snapshot: ComparisonSnapshot;
  broker: BrokerObservation;
  passed: boolean;
  issues: string[];
};
export type ChargeCheck = {
  id: string;
  at: string;
  source: 'BROKER_CALCULATOR' | 'CONTRACT_NOTE';
  reference: string;
  tradeDate: string;
  entry: number;
  exit: number;
  quantity: number;
  brokerTotal: number;
  estimatedTotal: number;
  difference: number;
  notes: string;
  schedule: string;
};
export type SessionReview = {
  day: string;
  at: string;
  notes: string;
  missedOpportunities: number;
  rulesFollowed: boolean;
};
export type ResearchEvidence = {
  version: 1;
  strategyVersion: typeof STRATEGY_VERSION;
  symbols: string[];
  startedAt: string;
  comparisons: MarketComparison[];
  chargeChecks: ChargeCheck[];
  sessions: SessionReview[];
  fiveSessionReview?: { at: string; notes: string };
};

function universe(symbols: string[]) {
  if (
    !Array.isArray(symbols) ||
    !symbols.length ||
    symbols.length > 3 ||
    new Set(symbols).size !== symbols.length ||
    symbols.some(
      (s) =>
        !INSTRUMENTS[s] ||
        INSTRUMENTS[s].exchange !== 'NSE' ||
        INSTRUMENTS[s].category === 'INDEX'
    )
  )
    throw new Error(
      'Choose one to three supported cash shares for the fixed study universe.'
    );
}
function evidence(
  book: PaperBook,
  symbols: string[],
  now: Date
): ResearchEvidence {
  if (book.research) return book.research;
  universe(symbols);
  return {
    version: 1,
    strategyVersion: STRATEGY_VERSION,
    symbols: [...symbols],
    startedAt: now.toISOString(),
    comparisons: [],
    chargeChecks: [],
    sessions: [],
  };
}
export function captureComparison(
  symbol: string,
  quote: PriceData | undefined,
  stockRaw: CandleData[],
  indexRaw: CandleData[],
  now = new Date()
): ComparisonSnapshot {
  if (!isIndianMarketOpen(now))
    throw new Error(
      'Capture the comparison during a regular NSE market session. Today’s off-hours connection check is not a supervised comparison.'
    );
  const problem = quoteProblem(quote, now);
  if (problem) throw new Error(problem);
  const stock = completedCandles(stockRaw, now),
    index = completedCandles(indexRaw, now);
  const barProblem =
    candleProblem(stock, now, 300) || candleProblem(index, now, 300);
  if (barProblem) throw new Error(barProblem);
  if (stock.at(-1)!.time !== index.at(-1)!.time)
    throw new Error('Stock and NIFTY completed bars are not aligned.');
  if (!quote?.tickSize || quote.instrumentAsOf !== istDateKey(now))
    throw new Error('Current instrument tick metadata is unavailable.');
  return {
    symbol,
    tick: quote.tickSize,
    capturedAt: now.toISOString(),
    exchangeTime: quote.exchangeTime!,
    ltp: quote.price,
    stock: { ...stock.at(-1)! },
    index: { ...index.at(-1)! },
  };
}
function validPrices(c: CandlePrices) {
  return (
    !!c &&
    [c.open, c.high, c.low, c.close].every(
      (n) => Number.isFinite(n) && n > 0
    ) &&
    c.high >= Math.max(c.open, c.close, c.low) &&
    c.low <= Math.min(c.open, c.close, c.high)
  );
}
function validDate(value: string) {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}
function validSnapshot(snapshot: ComparisonSnapshot) {
  const captured = new Date(snapshot.capturedAt),
    bar = Date.parse(snapshot.stock.time);
  return (
    isIndianMarketOpen(captured) &&
    snapshot.stock.time === snapshot.index.time &&
    [snapshot.stock, snapshot.index].every(
      (c) => completedCandles([c], captured).length === 1
    ) &&
    captured.getTime() - bar >= 300_000 &&
    captured.getTime() - bar < 630_000 &&
    captured.getTime() - Date.parse(snapshot.exchangeTime) <= 30_000 &&
    Date.parse(snapshot.exchangeTime) <= captured.getTime() + 5000
  );
}
export function comparisonIssues(
  snapshot: ComparisonSnapshot,
  broker: BrokerObservation
): string[] {
  if (
    !snapshot ||
    !validPrices(snapshot.stock) ||
    !validPrices(snapshot.index) ||
    !validPrices(broker?.stock) ||
    !validPrices(broker?.index) ||
    ![snapshot.tick, snapshot.ltp, broker.ltp].every(
      (n) => Number.isFinite(n) && n > 0
    ) ||
    ![snapshot.stock.volume, broker.stock.volume].every(
      (n) => Number.isFinite(n) && n >= 0
    ) ||
    ![
      snapshot.capturedAt,
      snapshot.exchangeTime,
      snapshot.stock.time,
      snapshot.index.time,
      broker.quoteTime,
      broker.barTime,
    ].every((t) => Number.isFinite(Date.parse(t)))
  )
    throw new Error(
      'Enter the broker timestamps and every OHLC/volume value correctly.'
    );
  const issues: string[] = [];
  if (
    Date.parse(broker.barTime) !== Date.parse(snapshot.stock.time) ||
    Date.parse(broker.barTime) !== Date.parse(snapshot.index.time)
  )
    issues.push(
      'Broker candle start time does not match the displayed completed five-minute bars.'
    );
  if (
    Math.abs(Date.parse(broker.quoteTime) - Date.parse(snapshot.exchangeTime)) >
    30_000
  )
    issues.push(
      'Quote timestamps differ by more than 30 seconds; compare the same observation.'
    );
  if (Math.abs(broker.ltp - snapshot.ltp) > snapshot.tick + 1e-7)
    issues.push('Stock last price differs by more than one instrument tick.');
  for (const field of ['open', 'high', 'low', 'close'] as const) {
    if (
      Math.abs(broker.stock[field] - snapshot.stock[field]) >
      snapshot.tick + 1e-7
    )
      issues.push(`Stock ${field} differs by more than one tick.`);
    if (Math.abs(broker.index[field] - snapshot.index[field]) > 0.010001)
      issues.push(`NIFTY ${field} differs by more than ₹0.01.`);
  }
  if (broker.stock.volume !== snapshot.stock.volume)
    issues.push(
      'Stock candle volume differs. Check that both charts use the same completed five-minute bar.'
    );
  return issues;
}
export function recordComparison(
  book: PaperBook,
  symbols: string[],
  snapshot: ComparisonSnapshot,
  broker: BrokerObservation,
  now = new Date()
): PaperBook {
  const research = evidence(book, symbols, now),
    elapsed = now.getTime() - Date.parse(snapshot.capturedAt);
  if (
    !isIndianMarketOpen(now) ||
    elapsed < 0 ||
    elapsed > 5 * 60_000 ||
    istDateKey(new Date(snapshot.capturedAt)) !== istDateKey(now)
  )
    throw new Error(
      'The snapshot must be captured in this session within the last five minutes. Capture again.'
    );
  if (!research.symbols.includes(snapshot.symbol))
    throw new Error('This share is outside the fixed study universe.');
  if (!validSnapshot(snapshot))
    throw new Error(
      'The captured snapshot is not a current, aligned completed-bar observation.'
    );
  if (Date.parse(broker.quoteTime) > now.getTime() + 5000)
    throw new Error('The broker quote timestamp is in the future.');
  const issues = comparisonIssues(snapshot, broker);
  const record: MarketComparison = {
    id: crypto.randomUUID(),
    at: now.toISOString(),
    snapshot,
    broker,
    passed: issues.length === 0,
    issues,
  };
  return {
    ...book,
    research: { ...research, comparisons: [...research.comparisons, record] },
  };
}
export function comparisonReady(
  book: PaperBook,
  symbol: string,
  now = new Date()
) {
  const latest = book.research?.comparisons
    .filter(
      (c) =>
        c.snapshot.symbol === symbol &&
        istDateKey(new Date(c.at)) === istDateKey(now)
    )
    .at(-1);
  return !!latest?.passed;
}
export function recordChargeCheck(
  book: PaperBook,
  symbols: string[],
  input: Omit<
    ChargeCheck,
    'id' | 'at' | 'estimatedTotal' | 'difference' | 'schedule'
  >,
  now = new Date()
): PaperBook {
  if (
    !['BROKER_CALCULATOR', 'CONTRACT_NOTE'].includes(input.source) ||
    !input.reference.trim() ||
    input.reference.length > 160 ||
    !Number.isFinite(input.brokerTotal) ||
    input.brokerTotal < 0 ||
    !validDate(input.tradeDate) ||
    input.tradeDate > istDateKey(now) ||
    input.tradeDate < '2026-03-01' ||
    input.notes.length > 2000
  )
    throw new Error(
      'Enter a source, reference, non-negative broker charge and a date covered by the current tariff (from 1 March 2026).'
    );
  const estimatedTotal = estimateCashCharges(
    input.entry,
    input.exit,
    input.quantity
  ).total;
  const research = evidence(book, symbols, now);
  const record: ChargeCheck = {
    ...input,
    reference: input.reference.trim(),
    id: crypto.randomUUID(),
    at: now.toISOString(),
    estimatedTotal,
    difference: Math.round((input.brokerTotal - estimatedTotal) * 100) / 100,
    schedule: CHARGE_SCHEDULE.id,
  };
  return {
    ...book,
    research: { ...research, chargeChecks: [...research.chargeChecks, record] },
  };
}
export function recordSessionReview(
  book: PaperBook,
  symbols: string[],
  input: { notes: string; missedOpportunities: number; rulesFollowed: boolean },
  now = new Date()
): PaperBook {
  const day = istDateKey(now),
    research = evidence(book, symbols, now);
  if (!isTradingDayIST(now) || getISTMinutes(now) < 705)
    throw new Error(
      'Record the session review after 11:45 IST on a regular trading day.'
    );
  if (
    !input.notes.trim() ||
    input.notes.length > 2000 ||
    !Number.isSafeInteger(input.missedOpportunities) ||
    input.missedOpportunities < 0 ||
    typeof input.rulesFollowed !== 'boolean'
  )
    throw new Error(
      'Add session notes, rule adherence and a non-negative whole missed-opportunity count.'
    );
  if (research.sessions.some((s) => s.day === day))
    throw new Error(
      'This session already has a review; it cannot count twice.'
    );
  const observed =
    research.comparisons.some((c) => istDateKey(new Date(c.at)) === day) ||
    book.positions.some((p) => istDateKey(new Date(p.enteredAt)) === day) ||
    book.observations.some((o) => istDateKey(new Date(o.at)) === day);
  if (!observed)
    throw new Error(
      'Record a supervised comparison, observation or paper entry for this session first.'
    );
  return {
    ...book,
    research: {
      ...research,
      sessions: [
        ...research.sessions,
        { ...input, notes: input.notes.trim(), day, at: now.toISOString() },
      ],
    },
  };
}
export function recordFiveSessionReview(
  book: PaperBook,
  symbols: string[],
  notes: string,
  now = new Date()
): PaperBook {
  const research = evidence(book, symbols, now);
  if (research.sessions.length < 5 || !notes.trim() || notes.length > 2000)
    throw new Error(
      'Complete five distinct session reviews and add your operational findings first.'
    );
  if (research.fiveSessionReview)
    throw new Error('The first five-session review is already recorded.');
  return {
    ...book,
    research: {
      ...research,
      fiveSessionReview: { at: now.toISOString(), notes: notes.trim() },
    },
  };
}
export function validateResearchEvidence(
  raw: ResearchEvidence | undefined,
  now = new Date()
) {
  if (raw === undefined) return;
  const validTime = (t: string) =>
    typeof t === 'string' &&
    Number.isFinite(Date.parse(t)) &&
    Date.parse(t) <= now.getTime();
  if (
    !raw ||
    raw.version !== 1 ||
    raw.strategyVersion !== STRATEGY_VERSION ||
    !validTime(raw.startedAt) ||
    ![raw.comparisons, raw.chargeChecks, raw.sessions].every(Array.isArray)
  )
    throw new Error(
      'Research evidence is invalid. Existing data was not overwritten.'
    );
  universe(raw.symbols);
  const ids = new Set<string>();
  for (const record of [...raw.comparisons, ...raw.chargeChecks]) {
    if (
      !record ||
      typeof record.id !== 'string' ||
      !record.id ||
      ids.has(record.id) ||
      !validTime(record.at) ||
      Date.parse(record.at) < Date.parse(raw.startedAt)
    )
      throw new Error('Research records contain invalid IDs or timestamps.');
    ids.add(record.id);
  }
  for (const c of raw.comparisons) {
    const elapsed = Date.parse(c.at) - Date.parse(c.snapshot.capturedAt);
    const issues = comparisonIssues(c.snapshot, c.broker);
    if (
      !raw.symbols.includes(c.snapshot.symbol) ||
      !isIndianMarketOpen(new Date(c.at)) ||
      !validSnapshot(c.snapshot) ||
      Date.parse(c.broker.quoteTime) > Date.parse(c.at) + 5000 ||
      elapsed < 0 ||
      elapsed > 300_000 ||
      c.passed !== (issues.length === 0) ||
      JSON.stringify(issues) !== JSON.stringify(c.issues)
    )
      throw new Error('A saved market comparison is inconsistent.');
  }
  for (const c of raw.chargeChecks) {
    const estimate = estimateCashCharges(c.entry, c.exit, c.quantity).total;
    if (
      !['BROKER_CALCULATOR', 'CONTRACT_NOTE'].includes(c.source) ||
      typeof c.reference !== 'string' ||
      !c.reference.trim() ||
      c.reference.length > 160 ||
      typeof c.notes !== 'string' ||
      c.notes.length > 2000 ||
      !validDate(c.tradeDate) ||
      c.tradeDate < '2026-03-01' ||
      c.tradeDate > istDateKey(new Date(c.at)) ||
      !Number.isFinite(c.brokerTotal) ||
      c.brokerTotal < 0 ||
      c.schedule !== CHARGE_SCHEDULE.id ||
      c.estimatedTotal !== estimate ||
      c.difference !== Math.round((c.brokerTotal - estimate) * 100) / 100
    )
      throw new Error('A saved charge comparison is invalid.');
  }
  const days = new Set<string>();
  for (const s of raw.sessions) {
    if (
      !s ||
      !validTime(s.at) ||
      Date.parse(s.at) < Date.parse(raw.startedAt) ||
      !isTradingDayIST(new Date(s.at)) ||
      getISTMinutes(new Date(s.at)) < 705 ||
      s.day !== istDateKey(new Date(s.at)) ||
      days.has(s.day) ||
      typeof s.notes !== 'string' ||
      !s.notes.trim() ||
      s.notes.length > 2000 ||
      !Number.isSafeInteger(s.missedOpportunities) ||
      s.missedOpportunities < 0 ||
      typeof s.rulesFollowed !== 'boolean'
    )
      throw new Error('A saved session review is invalid.');
    days.add(s.day);
  }
  if (
    raw.fiveSessionReview &&
    (!validTime(raw.fiveSessionReview.at) ||
      raw.sessions.filter(
        (s) => Date.parse(s.at) <= Date.parse(raw.fiveSessionReview!.at)
      ).length < 5 ||
      typeof raw.fiveSessionReview.notes !== 'string' ||
      !raw.fiveSessionReview.notes.trim() ||
      raw.fiveSessionReview.notes.length > 2000)
  )
    throw new Error('The five-session review is invalid.');
}
