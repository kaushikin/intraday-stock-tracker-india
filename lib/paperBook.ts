import type { PriceData } from '@/contexts/AppContext';
import { INSTRUMENTS } from './instruments';
import { istDateKey, isFreshSignalWindowOpenIST } from './marketHours';
import { BAR_MS, quoteProblem } from './marketDataQuality';
import { calculatePositionSizing } from './positionSizing';
import { PaperSetup, STRATEGY_VERSION } from './paperStrategy';
import {
  validateResearchEvidence,
  type ResearchEvidence,
} from './researchEvidence';

export const PAPER_BOOK_KEY = 'paper_trading_book_v1';
export const PAPER_RULES = Object.freeze({
  capital: 10000,
  maxRisk: 50,
  riskFraction: 0.005,
  dailyLoss: 100,
  weeklyLoss: 250,
  monthlyLoss: 500,
  drawdown: 500,
  maxTrades: 2,
  minNetRR: 1.2,
});
export type ExitReason = 'TARGET' | 'STOP' | 'TIME' | 'MANUAL';
export type PaperPosition = {
  id: string;
  mode: 'PAPER';
  setup: PaperSetup;
  entry: number;
  quantity: number;
  enteredAt: string;
  plannedRisk: number;
  estimatedCharges: number;
  slippageAllowance: number;
  notes: string;
  exit?: number;
  exitedAt?: string;
  charges?: number;
  exitReason?: ExitReason;
};
export type PaperObservation = {
  id: string;
  symbol: string;
  at: string;
  reason: string;
  setupId?: string;
};
export type PaperBook = {
  version: 1;
  positions: PaperPosition[];
  observations: PaperObservation[];
  research?: ResearchEvidence;
};
export const emptyPaperBook = (): PaperBook => ({
  version: 1,
  positions: [],
  observations: [],
});
const money = (n: number) => Math.round(n * 100) / 100;
export const isClosed = (p: PaperPosition) => p.exitedAt !== undefined;
export const positionPL = (p: PaperPosition) =>
  isClosed(p) ? money((p.exit! - p.entry) * p.quantity - p.charges!) : 0;
function validSetup(setup: PaperSetup | undefined): boolean {
  if (
    !setup ||
    typeof setup.id !== 'string' ||
    !setup.id ||
    typeof setup.symbol !== 'string'
  )
    return false;
  const instrument = INSTRUMENTS[setup.symbol];
  const bar = Date.parse(setup.barTime),
    created = Date.parse(setup.createdAt),
    expires = Date.parse(setup.expiresAt);
  return (
    !!instrument &&
    instrument.exchange === 'NSE' &&
    instrument.category !== 'INDEX' &&
    setup.side === 'BUY' &&
    setup.version === STRATEGY_VERSION &&
    [
      bar,
      created,
      expires,
      setup.entry,
      setup.stop,
      setup.target,
      setup.tickSize,
    ].every(Number.isFinite) &&
    created === bar + BAR_MS &&
    expires === created + 2 * BAR_MS &&
    isFreshSignalWindowOpenIST(new Date(created)) &&
    setup.stop > 0 &&
    setup.stop < setup.entry &&
    setup.target > setup.entry &&
    setup.tickSize > 0
  );
}
function weekStart(key: string) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function paperAccount(book: PaperBook, now = new Date()) {
  const day = istDateKey(now),
    week = weekStart(day),
    month = day.slice(0, 7);
  const closed = book.positions
    .filter(isClosed)
    .sort((a, b) => Date.parse(a.exitedAt!) - Date.parse(b.exitedAt!));
  let equity = Number(PAPER_RULES.capital),
    highWater = equity,
    maxDrawdown = 0;
  for (const position of closed) {
    equity = money(equity + positionPL(position));
    highWater = Math.max(highWater, equity);
    maxDrawdown = Math.max(maxDrawdown, highWater - equity);
  }
  const sum = (filter: (date: string) => boolean) =>
    money(
      closed
        .filter((p) => filter(istDateKey(new Date(p.exitedAt!))))
        .reduce((n, p) => n + positionPL(p), 0)
    );
  const dailyPL = sum((key) => key === day),
    weeklyPL = sum((key) => key >= week && key <= day),
    monthlyPL = sum((key) => key.startsWith(month));
  const open = book.positions.filter((p) => !isClosed(p));
  const tradesToday = book.positions.filter(
    (p) => istDateKey(new Date(p.enteredAt)) === day
  ).length;
  const drawdown = money(highWater - equity);
  const riskBudget = Math.max(
    0,
    Math.min(
      PAPER_RULES.maxRisk,
      equity * PAPER_RULES.riskFraction,
      PAPER_RULES.dailyLoss + dailyPL,
      PAPER_RULES.weeklyLoss + weeklyPL,
      PAPER_RULES.monthlyLoss + monthlyPL,
      PAPER_RULES.drawdown - drawdown
    )
  );
  const reasons: string[] = [];
  if (open.length)
    reasons.push('Close the existing paper position before opening another.');
  if (tradesToday >= PAPER_RULES.maxTrades)
    reasons.push('Two-entry daily limit reached.');
  if (dailyPL <= -PAPER_RULES.dailyLoss)
    reasons.push('Daily loss limit reached.');
  if (weeklyPL <= -PAPER_RULES.weeklyLoss)
    reasons.push('Weekly loss limit reached.');
  if (monthlyPL <= -PAPER_RULES.monthlyLoss)
    reasons.push('Monthly loss limit reached.');
  if (drawdown >= PAPER_RULES.drawdown)
    reasons.push('Drawdown limit reached. Pause and review.');
  return {
    equity,
    highWater,
    drawdown,
    maxDrawdown,
    dailyPL,
    weeklyPL,
    monthlyPL,
    tradesToday,
    open,
    riskBudget: Math.floor(riskBudget * 100) / 100,
    availableCapital: Math.max(0, equity * 0.95),
    reasons,
  };
}

export function previewPaperEntry(
  book: PaperBook,
  setup: PaperSetup,
  quote: PriceData | undefined,
  charges: number,
  slippage: number,
  now = new Date()
) {
  const account = paperAccount(book, now),
    reasons = [...account.reasons];
  if (!isFreshSignalWindowOpenIST(now))
    reasons.push('Outside the verified 09:45–11:15 IST research entry window.');
  if (!validSetup(setup))
    reasons.push(
      'Setup metadata, levels or validity period are invalid. Only supported long cash-equity research setups are allowed.'
    );
  if (
    !Number.isFinite(Date.parse(setup.createdAt)) ||
    now.getTime() < Date.parse(setup.createdAt) ||
    now.getTime() >= Date.parse(setup.expiresAt) ||
    istDateKey(new Date(setup.createdAt)) !== istDateKey(now)
  )
    reasons.push('Setup has expired or its creation time is invalid.');
  if (book.positions.some((p) => p.setup.id === setup.id))
    reasons.push('This setup has already been entered.');
  const problem = quoteProblem(quote, now);
  if (problem) reasons.push(problem);
  const entry = quote?.ask || 0,
    bid = quote?.bid || 0,
    distance = setup.entry - setup.stop;
  if (
    quote?.instrumentAsOf !== istDateKey(now) ||
    quote?.tickSize !== setup.tickSize
  )
    reasons.push(
      'Instrument metadata is missing or changed. Refresh the setup.'
    );
  if (!(entry > 0 && bid > 0 && entry >= bid))
    reasons.push('Executable bid/ask unavailable.');
  if (entry < setup.entry) reasons.push('Entry trigger has not been reached.');
  if (entry > setup.entry + distance * 0.1)
    reasons.push('Price has moved too far beyond the trigger. Do not chase.');
  if (entry >= setup.target || distance <= 0)
    reasons.push('Invalid entry, stop or target.');
  if (entry - bid > distance * 0.1)
    reasons.push('Bid/ask spread is too wide for the stop.');
  const sizing = calculatePositionSizing({
    side: 'BUY',
    entry,
    stopLoss: setup.stop,
    target: setup.target,
    maxRiskAmount: account.riskBudget,
    estimatedCharges: charges,
    slippageAllowance: slippage,
    availableCapital: account.availableCapital,
  });
  const q = sizing.suggestedQuantity;
  if (q <= 0)
    reasons.push(
      'No whole-share quantity fits cash, costs and remaining risk.'
    );
  if (
    q > 0 &&
    charges < 2 * Math.max(5, Math.min(20, q * entry * 0.001)) * 1.18
  )
    reasons.push(
      'Charge estimate is below the published Angel cash brokerage plus GST floor. Add all other levies too.'
    );
  if (q > 0 && entry - bid + slippage / q > distance * 0.1)
    reasons.push('Spread plus slippage exceeds 10% of the stop distance.');
  if (!Number.isFinite(quote?.askQuantity) || (quote?.askQuantity || 0) < q)
    reasons.push('Best ask depth does not cover the proposed paper quantity.');
  // Compare unrounded values: a rounded display of 1.20 must not pass 1.195.
  const actualRR =
    q > 0
      ? (q * (setup.target - entry) - charges - slippage) /
        (q * (entry - setup.stop) + charges + slippage)
      : 0;
  if (actualRR < PAPER_RULES.minNetRR)
    reasons.push(
      'Net reward/risk is below 1.2 after estimated costs and slippage.'
    );
  return {
    account,
    sizing,
    entry,
    reasons: [...new Set(reasons)],
    allowed: reasons.length === 0,
  };
}

export function openPaperPosition(
  book: PaperBook,
  setup: PaperSetup,
  quote: PriceData,
  charges: number,
  slippage: number,
  notes: string,
  now = new Date()
): PaperBook {
  const check = previewPaperEntry(book, setup, quote, charges, slippage, now);
  if (!check.allowed) throw new Error(check.reasons.join(' '));
  if (!notes.trim())
    throw new Error(
      'Record your event-calendar and setup check before paper entry.'
    );
  const position: PaperPosition = {
    id: setup.id,
    mode: 'PAPER',
    setup: { ...setup },
    entry: check.entry,
    quantity: check.sizing.suggestedQuantity,
    enteredAt: now.toISOString(),
    plannedRisk: check.sizing.netLossAtStop,
    estimatedCharges: charges,
    slippageAllowance: slippage,
    notes: notes.trim().slice(0, 2000),
  };
  return { ...book, positions: [...book.positions, position] };
}

export function closePaperPosition(
  book: PaperBook,
  id: string,
  exit: number,
  charges: number,
  reason: ExitReason,
  exitedAt: string,
  now = new Date()
): PaperBook {
  const position = book.positions.find((p) => p.id === id);
  if (!position || isClosed(position))
    throw new Error('Position does not exist or is already closed.');
  if (
    !Number.isFinite(exit) ||
    exit <= 0 ||
    !Number.isFinite(charges) ||
    charges < 0
  )
    throw new Error(
      'Enter a positive exit price and non-negative total charges.'
    );
  if (!['TARGET', 'STOP', 'TIME', 'MANUAL'].includes(reason))
    throw new Error('Invalid exit reason.');
  const timestamp = Date.parse(exitedAt);
  if (
    !Number.isFinite(timestamp) ||
    timestamp < Date.parse(position.enteredAt) ||
    timestamp > now.getTime()
  )
    throw new Error('Exit time must be between entry and now.');
  if (reason === 'TARGET' && exit < position.setup.target)
    throw new Error(
      'This price did not reach the target. Use the actual exit reason.'
    );
  if (reason === 'STOP' && exit > position.setup.stop)
    throw new Error(
      'This price did not reach the stop. Use the actual exit reason.'
    );
  if (
    reason === 'TIME' &&
    timestamp < Date.parse(position.enteredAt) + 30 * 60_000
  )
    throw new Error('The 30-minute time exit has not elapsed.');
  return {
    ...book,
    positions: book.positions.map((p) =>
      p.id === id
        ? {
            ...p,
            exit,
            exitedAt: new Date(timestamp).toISOString(),
            charges,
            exitReason: reason,
          }
        : p
    ),
  };
}

export function paperStats(book: PaperBook) {
  const closed = book.positions.filter(isClosed),
    n = closed.length,
    results = closed.map(positionPL);
  const winners = results.filter((x) => x > 0),
    losers = results.filter((x) => x < 0),
    wins = winners.length;
  const net = money(results.reduce((a, b) => a + b, 0)),
    losses = -losers.reduce((a, b) => a + b, 0);
  const p = n ? wins / n : 0,
    z = 1.95996398454,
    den = 1 + (z * z) / (n || 1);
  const center = (p + (z * z) / (2 * (n || 1))) / den,
    delta =
      (z *
        Math.sqrt((p * (1 - p)) / (n || 1) + (z * z) / (4 * (n || 1) ** 2))) /
      den;
  return {
    count: n,
    wins,
    losses: losers.length,
    breakeven: n - wins - losers.length,
    net,
    expectancy: n ? net / n : 0,
    winRate: n ? p * 100 : null,
    interval: n
      ? [Math.max(0, center - delta) * 100, Math.min(1, center + delta) * 100]
      : null,
    profitFactor: losses ? winners.reduce((a, b) => a + b, 0) / losses : null,
    sessions: new Set(
      book.positions.map((p) => istDateKey(new Date(p.enteredAt)))
    ).size,
  };
}

export function parsePaperBook(
  raw: string | null,
  now = new Date()
): PaperBook {
  if (raw === null) return emptyPaperBook();
  const book = JSON.parse(raw);
  if (
    book?.version !== 1 ||
    !Array.isArray(book.positions) ||
    !Array.isArray(book.observations)
  )
    throw new Error(
      'Paper journal is invalid. Export the raw backup before restoring it.'
    );
  const ids = new Set<string>();
  for (const p of book.positions) {
    if (
      !validSetup(p?.setup) ||
      Date.parse(p.enteredAt) < Date.parse(p.setup.createdAt) ||
      Date.parse(p.enteredAt) >= Date.parse(p.setup.expiresAt) ||
      Date.parse(p.enteredAt) > now.getTime()
    )
      throw new Error('Paper journal contains invalid setup or entry times.');
    if (
      p?.mode !== 'PAPER' ||
      typeof p.id !== 'string' ||
      ids.has(p.id) ||
      p.setup?.version !== STRATEGY_VERSION ||
      p.setup?.side !== 'BUY' ||
      p.id !== p.setup?.id ||
      typeof p.notes !== 'string' ||
      !Number.isInteger(p.quantity) ||
      p.quantity <= 0 ||
      ![
        p.entry,
        p.plannedRisk,
        p.estimatedCharges,
        p.slippageAllowance,
        p.setup.entry,
        p.setup.stop,
        p.setup.target,
        p.setup.tickSize,
      ].every(Number.isFinite) ||
      p.entry <= 0 ||
      p.plannedRisk <= 0 ||
      p.estimatedCharges < 0 ||
      p.slippageAllowance < 0 ||
      p.setup.stop <= 0 ||
      p.setup.target <= p.setup.entry ||
      p.setup.stop >= p.setup.entry ||
      p.setup.tickSize <= 0 ||
      !Number.isFinite(Date.parse(p.enteredAt))
    )
      throw new Error(
        'Paper journal contains an invalid position. Existing data was not overwritten.'
      );
    if (
      isClosed(p) &&
      (![p.exit, p.charges].every(Number.isFinite) ||
        p.exit <= 0 ||
        p.charges < 0 ||
        !Number.isFinite(Date.parse(p.exitedAt)) ||
        Date.parse(p.exitedAt) < Date.parse(p.enteredAt) ||
        !['TARGET', 'STOP', 'TIME', 'MANUAL'].includes(p.exitReason))
    )
      throw new Error('Paper journal contains an invalid closed position.');
    if (
      isClosed(p) &&
      (Date.parse(p.exitedAt) > now.getTime() ||
        (p.exitReason === 'TARGET' && p.exit < p.setup.target) ||
        (p.exitReason === 'STOP' && p.exit > p.setup.stop) ||
        (p.exitReason === 'TIME' &&
          Date.parse(p.exitedAt) < Date.parse(p.enteredAt) + 30 * 60_000))
    )
      throw new Error('Paper journal contains an inconsistent exit.');
    if (
      !isClosed(p) &&
      [p.exit, p.charges, p.exitReason].some((value) => value !== undefined)
    )
      throw new Error('Paper journal contains an incomplete exit.');
    ids.add(p.id);
  }
  if (book.positions.filter((p: PaperPosition) => !isClosed(p)).length > 1)
    throw new Error('Paper journal contains overlapping open positions.');
  if (
    book.observations.some(
      (o: PaperObservation) =>
        !o ||
        typeof o.id !== 'string' ||
        typeof o.symbol !== 'string' ||
        typeof o.reason !== 'string' ||
        !Number.isFinite(Date.parse(o.at)) ||
        Date.parse(o.at) > now.getTime()
    )
  )
    throw new Error('Paper observations are invalid.');
  validateResearchEvidence(book.research, now);
  return book;
}
