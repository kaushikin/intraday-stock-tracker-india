import type { PriceData } from '@/contexts/AppContext';
import { INSTRUMENTS } from './instruments';
import {
  istDateKey,
  isIndianMarketOpen,
  isFreshSignalWindowOpenIST,
} from './marketHours';
import { BAR_MS, completedCandles, quoteProblem } from './marketDataQuality';
import {
  paperAccount,
  paperStats,
  closePaperPosition,
  type PaperBook,
  type PaperPosition,
  type ExitReason,
} from './paperBook';
import {
  captureComparison,
  comparisonIssues,
  type ComparisonSnapshot,
  type BrokerObservation,
  type MarketComparison,
} from './researchEvidence';
import {
  screenCandidate,
  sizeScannerSetup,
  validateScanConfig,
  type ScanConfig,
  type ScanPlan,
} from './niftyScanner';
import type { ScannerData } from './scannerFeed';
import { NIFTY50_SOURCE, type NiftyUniverse } from './nifty50';
import { STRATEGY_VERSION } from './paperStrategy';
import { estimateCashCharges } from './brokerCharges';

export const SCANNER_BOOK_KEY = 'scanner_paper_journal_v1';
const NIFTY50_ALTERNATE_SOURCE =
  'https://archives.nseindia.com/content/indices/ind_nifty50list.csv';
export const SCANNER_BOOK_KIND = 'SCANNER_EXPLORATORY_PAPER';
export type ScannerFeeCheck = {
  id: string;
  at: string;
  key: string;
  symbol: string;
  source: 'BROKER_CALCULATOR' | 'ACCOUNT_TARIFF';
  reference: string;
  atStop: number;
  atTarget: number;
};
export type ScannerPosition = PaperPosition & {
  origin: typeof SCANNER_BOOK_KIND;
  proof: {
    quote: PriceData;
    config: ScanConfig;
    plan: ScanPlan;
    comparisonId: string;
    feeId: string;
    universe: Pick<NiftyUniverse, 'asOf' | 'checkedAt' | 'source'>;
  };
  exitNotes?: string;
};
export type ScannerBook = {
  version: 1;
  kind: typeof SCANNER_BOOK_KIND;
  positions: ScannerPosition[];
  comparisons: MarketComparison[];
  feeChecks: ScannerFeeCheck[];
  observations: { id: string; at: string; symbol: string; reason: string }[];
};
export const emptyScannerBook = (): ScannerBook => ({
  version: 1,
  kind: SCANNER_BOOK_KIND,
  positions: [],
  comparisons: [],
  feeChecks: [],
  observations: [],
});
const asPaperBook = (positions: PaperPosition[]): PaperBook => ({
  version: 1,
  positions,
  observations: [],
});
export const scannerStats = (book: ScannerBook) =>
  paperStats(asPaperBook(book.positions));
export const sharedAccount = (
  scanner: ScannerBook,
  study: PaperBook,
  now = new Date()
) => paperAccount(asPaperBook([...study.positions, ...scanner.positions]), now);
export function sharedEntryReasons(
  scanner: ScannerBook,
  study: PaperBook,
  risk: number,
  cash: number,
  now = new Date()
) {
  const account = sharedAccount(scanner, study, now);
  return [
    ...account.reasons.map((r) => `Across both journals: ${r}`),
    ...(!Number.isFinite(risk) || risk > account.riskBudget + 1e-8
      ? ['Planned risk exceeds the remaining combined paper budget.']
      : []),
    ...(!Number.isFinite(cash) || cash > account.availableCapital + 1e-8
      ? ['Cash exceeds the combined paper account allowance.']
      : []),
  ];
}
export function studySymbols(study: PaperBook, watchlist: string[]) {
  return (
    study.research?.symbols ||
    watchlist
      .filter(
        (s) =>
          INSTRUMENTS[s]?.exchange === 'NSE' &&
          INSTRUMENTS[s]?.category !== 'INDEX'
      )
      .slice(0, 3)
  );
}
function symbolOK(s: string) {
  return (
    typeof s === 'string' &&
    /^[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(s) &&
    !['NIFTY', 'BANKNIFTY'].includes(s)
  );
}
function textOK(s: string) {
  return typeof s === 'string' && !!s.trim() && s.length <= 2000;
}
function past(t: string, now: Date) {
  return (
    typeof t === 'string' &&
    Number.isFinite(Date.parse(t)) &&
    Date.parse(t) <= now.getTime()
  );
}
function sameDay(a: string, now: Date) {
  return istDateKey(new Date(a)) === istDateKey(now);
}
function validComparison(
  snapshot: ComparisonSnapshot,
  broker: BrokerObservation,
  now: Date
) {
  const elapsed = now.getTime() - Date.parse(snapshot.capturedAt);
  if (
    !symbolOK(snapshot.symbol) ||
    !isIndianMarketOpen(now) ||
    elapsed < 0 ||
    elapsed > 300_000 ||
    !sameDay(snapshot.capturedAt, now)
  )
    throw new Error(
      'Capture a fresh comparison in this session and save within five minutes.'
    );
  if (Date.parse(broker.quoteTime) > now.getTime() + 5000)
    throw new Error('Broker quote timestamp is in the future.');
  // Revalidate the compact snapshot without requiring the full warm-up history.
  const bar = Date.parse(snapshot.stock.time),
    captured = Date.parse(snapshot.capturedAt);
  if (
    !isIndianMarketOpen(new Date(captured)) ||
    [snapshot.stock, snapshot.index].some(
      (c) =>
        completedCandles([c], new Date(captured)).length !== 1 ||
        !sameDay(c.time, new Date(captured))
    ) ||
    !Number.isFinite(bar) ||
    snapshot.stock.time !== snapshot.index.time ||
    captured - bar < BAR_MS ||
    captured - bar >= 630_000 ||
    captured - Date.parse(snapshot.exchangeTime) > 30_000 ||
    Date.parse(snapshot.exchangeTime) > captured + 5000
  )
    throw new Error(
      'Snapshot candles or exchange timestamp are not current and aligned.'
    );
  return comparisonIssues(snapshot, broker);
}
export function saveScannerComparison(
  book: ScannerBook,
  snapshot: ComparisonSnapshot,
  broker: BrokerObservation,
  now = new Date()
): ScannerBook {
  const issues = validComparison(snapshot, broker, now);
  return {
    ...book,
    comparisons: [
      ...book.comparisons,
      {
        id: crypto.randomUUID(),
        at: now.toISOString(),
        snapshot,
        broker,
        passed: issues.length === 0,
        issues,
      },
    ],
  };
}
export function latestScannerComparison(
  book: ScannerBook,
  symbol: string,
  now = new Date()
) {
  return book.comparisons
    .filter(
      (c) =>
        c.snapshot.symbol === symbol &&
        sameDay(c.at, now) &&
        Date.parse(c.at) <= now.getTime()
    )
    .at(-1);
}
export function scannerFeeKey(
  symbol: string,
  setupId: string,
  plan: ScanPlan,
  config: ScanConfig
) {
  return JSON.stringify([
    symbol,
    setupId,
    plan.entry,
    plan.quantity,
    plan.stop,
    plan.target,
    plan.planningCharges,
    config.slippage,
    config.roundingReserve,
    config.extraCharges,
  ]);
}
export function saveScannerFees(
  book: ScannerBook,
  check: Omit<ScannerFeeCheck, 'id' | 'at'>,
  now = new Date()
): ScannerBook {
  if (
    !isFreshSignalWindowOpenIST(now) ||
    !symbolOK(check.symbol) ||
    !textOK(check.key) ||
    !textOK(check.reference) ||
    !['BROKER_CALCULATOR', 'ACCOUNT_TARIFF'].includes(check.source) ||
    ![check.atStop, check.atTarget].every((n) => Number.isFinite(n) && n >= 0)
  )
    throw new Error(
      'Enter both broker fee totals and their source/reference during the entry window.'
    );
  return {
    ...book,
    feeChecks: [
      ...book.feeChecks,
      { ...check, id: crypto.randomUUID(), at: now.toISOString() },
    ],
  };
}
export type ScannerContext = {
  universe: NiftyUniverse;
  data: ScannerData;
  config: ScanConfig;
  symbol: string;
};
export function previewScannerEntry(
  book: ScannerBook,
  study: PaperBook,
  fixedSymbols: string[],
  context: ScannerContext,
  now = new Date()
) {
  const { universe, data, symbol } = context;
  validateScanConfig(context.config);
  const account = sharedAccount(book, study, now);
  const config = {
    ...context.config,
    riskBudget: Math.min(context.config.riskBudget, account.riskBudget),
    cash: Math.min(context.config.cash, account.availableCapital),
  };
  const reasons = [...account.reasons.map((r) => `Across both journals: ${r}`)];
  if (fixedSymbols.includes(symbol))
    reasons.push(
      'This is a study share. Record it only in Practice after its own checks.'
    );
  if (!fixedSymbols.length)
    reasons.push(
      'Choose the three study shares in Practice before scanner entries.'
    );
  if (
    universe.asOf !== istDateKey(now) ||
    !past(universe.checkedAt, now) ||
    ![NIFTY50_SOURCE, NIFTY50_ALTERNATE_SOURCE].includes(universe.source) ||
    universe.members.length !== 50 ||
    !universe.members.some((m) => m.symbol === symbol)
  )
    reasons.push('Current official Nifty 50 membership is not verified.');
  const result =
    config.riskBudget > 0 && config.cash > 0
      ? screenCandidate(
          symbol,
          data.quotes[symbol],
          data.candles[symbol] || [],
          data.candles.NIFTY || [],
          config,
          now,
          [...(data.errors[symbol] || []), ...(data.errors.NIFTY || [])]
        )
      : undefined;
  if (result?.status !== 'SHORTLIST')
    reasons.push(
      ...(result?.reasons || ['No remaining shared risk/cash budget.'])
    );
  if (
    book.positions.some((p) => p.setup.id === result?.setup?.id) ||
    study.positions.some((p) => p.setup.id === result?.setup?.id)
  )
    reasons.push('This setup has already been entered.');
  const comparison = latestScannerComparison(book, symbol, now);
  if (!comparison?.passed)
    reasons.push(
      'Save a matching broker candle/price comparison for this share today.'
    );
  const key =
    result?.plan && result.setup
      ? scannerFeeKey(symbol, result.setup.id, result.plan, config)
      : '';
  const fees = book.feeChecks
    .filter(
      (f) =>
        f.key === key && sameDay(f.at, now) && Date.parse(f.at) <= now.getTime()
    )
    .at(-1);
  if (!fees)
    reasons.push(
      'Verify and save fees for this exact entry, quantity and cost scenario.'
    );
  else if (
    result?.plan &&
    Math.max(fees.atStop, fees.atTarget) + config.roundingReserve >
      result.plan.planningCharges + 1e-8
  )
    reasons.push(
      'Broker fees plus rounding exceed the planning charge reserve. Increase extra charges and recheck.'
    );
  return {
    result,
    config,
    account,
    comparison,
    fees,
    key,
    reasons: [...new Set(reasons)],
    allowed: reasons.length === 0,
  };
}
export function openScannerPosition(
  book: ScannerBook,
  study: PaperBook,
  fixedSymbols: string[],
  context: ScannerContext,
  notes: string,
  reviewed: boolean,
  now = new Date()
): ScannerBook {
  const check = previewScannerEntry(book, study, fixedSymbols, context, now);
  if (!check.allowed) throw new Error(check.reasons.join(' '));
  if (!reviewed || !textOK(notes))
    throw new Error(
      'Review events, supervision and charges; enter your notes before recording.'
    );
  const { setup, plan } = check.result!;
  const position: ScannerPosition = {
    id: setup!.id,
    mode: 'PAPER',
    origin: SCANNER_BOOK_KIND,
    setup: { ...setup! },
    entry: plan!.entry,
    quantity: plan!.quantity,
    enteredAt: now.toISOString(),
    plannedRisk: plan!.risk,
    estimatedCharges: plan!.planningCharges,
    slippageAllowance: check.config.slippage,
    notes: notes.trim(),
    proof: {
      quote: { ...context.data.quotes[context.symbol] },
      config: { ...check.config },
      plan: { ...plan! },
      comparisonId: check.comparison!.id,
      feeId: check.fees!.id,
      universe: {
        asOf: context.universe.asOf,
        checkedAt: context.universe.checkedAt,
        source: context.universe.source,
      },
    },
  };
  return { ...book, positions: [...book.positions, position] };
}
export function closeScannerPosition(
  book: ScannerBook,
  id: string,
  exit: number,
  charges: number,
  reason: ExitReason,
  exitedAt: string,
  notes: string,
  now = new Date()
): ScannerBook {
  if (!textOK(notes))
    throw new Error('Record the observed exit source and any data gaps.');
  const p = book.positions.find((p) => p.id === id);
  if (!p) throw new Error('Scanner position not found.');
  if (charges + 1e-8 < estimateCashCharges(p.entry, exit, p.quantity).total)
    throw new Error(
      'Exit fees are below the published estimate. Include the round-trip charges.'
    );
  const closed = closePaperPosition(
    asPaperBook(book.positions),
    id,
    exit,
    charges,
    reason,
    exitedAt,
    now
  );
  return {
    ...book,
    positions: closed.positions.map((p) =>
      p.id === id ? { ...p, exitNotes: notes.trim() } : p
    ) as ScannerPosition[],
  };
}
export function addScannerObservation(
  book: ScannerBook,
  symbol: string,
  reason: string,
  now = new Date()
): ScannerBook {
  if ((!symbolOK(symbol) && symbol !== 'SESSION') || !textOK(reason))
    throw new Error(
      'Enter a session note or a reason for skipping this share.'
    );
  return {
    ...book,
    observations: [
      ...book.observations,
      {
        id: crypto.randomUUID(),
        at: now.toISOString(),
        symbol,
        reason: reason.trim(),
      },
    ],
  };
}

// Independent, versioned schema: a Practice or legacy backup is never accepted here.
export function parseScannerBook(
  raw: string | null,
  now = new Date()
): ScannerBook {
  if (raw === null) return emptyScannerBook();
  const b = JSON.parse(raw) as ScannerBook;
  const invalid = () => {
    throw new Error(
      'Scanner journal is invalid. Export its raw backup; existing data was not overwritten.'
    );
  };
  if (
    b?.version !== 1 ||
    b.kind !== SCANNER_BOOK_KIND ||
    ![b.positions, b.comparisons, b.feeChecks, b.observations].every(
      (a) => Array.isArray(a) && a.length <= 10000
    )
  )
    invalid();
  for (const list of [
    b.positions,
    b.comparisons,
    b.feeChecks,
    b.observations,
  ]) {
    if (
      new Set(list.map((x) => x?.id)).size !== list.length ||
      list.some((x) => !textOK(x?.id))
    )
      invalid();
  }
  for (const c of b.comparisons) {
    if (!past(c.at, now) || !c.snapshot || !c.broker) invalid();
    const issues = validComparison(c.snapshot, c.broker, new Date(c.at));
    if (
      c.passed !== (issues.length === 0) ||
      JSON.stringify(c.issues) !== JSON.stringify(issues)
    )
      invalid();
  }
  for (const f of b.feeChecks) {
    if (!past(f.at, now)) invalid();
    saveScannerFees(emptyScannerBook(), f, new Date(f.at));
  }
  for (const o of b.observations)
    if (
      !past(o.at, now) ||
      (!symbolOK(o.symbol) && o.symbol !== 'SESSION') ||
      !textOK(o.reason)
    )
      invalid();
  for (const p of b.positions) {
    if (
      !p?.setup ||
      !p.proof ||
      p.origin !== SCANNER_BOOK_KIND ||
      p.mode !== 'PAPER' ||
      p.id !== p.setup.id ||
      !symbolOK(p.setup.symbol) ||
      p.setup.version !== STRATEGY_VERSION ||
      p.setup.side !== 'BUY' ||
      !past(p.enteredAt, now) ||
      !textOK(p.notes) ||
      Date.parse(p.setup.createdAt) !== Date.parse(p.setup.barTime) + BAR_MS ||
      Date.parse(p.setup.expiresAt) !==
        Date.parse(p.setup.createdAt) + 2 * BAR_MS
    )
      invalid();
    const u = p.proof.universe,
      entered = new Date(p.enteredAt);
    if (
      !u ||
      u.asOf !== istDateKey(entered) ||
      !past(u.checkedAt, entered) ||
      ![NIFTY50_SOURCE, NIFTY50_ALTERNATE_SOURCE].includes(u.source)
    )
      invalid();
    const sized = sizeScannerSetup(
      p.setup,
      p.proof.quote,
      p.proof.config,
      entered
    );
    const plan = sized.plan;
    if (
      sized.reasons.length ||
      !plan ||
      JSON.stringify(plan) !== JSON.stringify(p.proof.plan) ||
      p.quantity !== plan.quantity ||
      p.entry !== plan.entry ||
      p.plannedRisk !== plan.risk ||
      p.estimatedCharges !== plan.planningCharges ||
      p.slippageAllowance !== p.proof.config.slippage
    )
      invalid();
    const comparison = b.comparisons.find((c) => c.id === p.proof.comparisonId),
      fees = b.feeChecks.find((f) => f.id === p.proof.feeId);
    if (
      !comparison?.passed ||
      !past(comparison.at, entered) ||
      !sameDay(comparison.at, entered) ||
      comparison.snapshot.symbol !== p.setup.symbol ||
      !fees ||
      !past(fees.at, entered) ||
      !sameDay(fees.at, entered) ||
      fees.key !==
        scannerFeeKey(p.setup.symbol, p.setup.id, plan!, p.proof.config) ||
      Math.max(fees.atStop, fees.atTarget) + p.proof.config.roundingReserve >
        plan!.planningCharges + 1e-8
    )
      invalid();
    if (p.exitedAt !== undefined) {
      if (!past(p.exitedAt, now)) invalid();
      const open = { ...p };
      delete open.exitedAt;
      delete open.exit;
      delete open.exitReason;
      delete open.charges;
      delete open.exitNotes;
      closeScannerPosition(
        { ...emptyScannerBook(), positions: [open] },
        p.id,
        p.exit!,
        p.charges!,
        p.exitReason!,
        p.exitedAt,
        p.exitNotes!,
        now
      );
    } else if (
      [p.exit, p.exitReason, p.charges, p.exitNotes].some(
        (v) => v !== undefined
      )
    )
      invalid();
  }
  const sorted = [...b.positions].sort(
    (a, c) => Date.parse(a.enteredAt) - Date.parse(c.enteredAt)
  );
  for (let i = 1; i < sorted.length; i++)
    if (
      !sorted[i - 1].exitedAt ||
      Date.parse(sorted[i].enteredAt) < Date.parse(sorted[i - 1].exitedAt!)
    )
      invalid();
  return b;
}
export function mergeScannerBackup(
  current: ScannerBook,
  incoming: ScannerBook,
  study: PaperBook,
  now = new Date()
) {
  const merged = { ...current };
  for (const key of [
    'positions',
    'comparisons',
    'feeChecks',
    'observations',
  ] as const) {
    const records = new Map<string, any>(
      (current[key] as { id: string }[]).map((x) => [x.id, x])
    );
    for (const value of incoming[key]) {
      if (
        records.has(value.id) &&
        JSON.stringify(records.get(value.id)) !== JSON.stringify(value)
      )
        throw new Error(
          'Backup conflicts with an existing scanner record. No data was changed.'
        );
      records.set(value.id, value);
    }
    (merged[key] as any[]) = [...records.values()].sort(
      (a, b) =>
        Date.parse(a.at || a.enteredAt) - Date.parse(b.at || b.enteredAt)
    );
  }
  const checked = parseScannerBook(JSON.stringify(merged), now);
  assertNoSharedOverlap(checked, study);
  return checked;
}
export function assertNoSharedOverlap(scanner: ScannerBook, study: PaperBook) {
  const intervals = [...study.positions, ...scanner.positions].sort(
    (a, b) => Date.parse(a.enteredAt) - Date.parse(b.enteredAt)
  );
  for (let i = 1; i < intervals.length; i++)
    if (
      !intervals[i - 1].exitedAt ||
      Date.parse(intervals[i].enteredAt) <
        Date.parse(intervals[i - 1].exitedAt!)
    )
      throw new Error(
        'Backup overlaps a study/scanner position. Resolve the source records before restoring.'
      );
}
export function scannerCSV(book: ScannerBook) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? '')
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const rows: unknown[][] = [
    [
      'origin',
      'symbol',
      'entry_time',
      'entry',
      'quantity',
      'stop',
      'target',
      'planned_risk',
      'exit_time',
      'exit',
      'exit_reason',
      'estimated_round_trip_charges',
      'net_paper_pl',
      'notes',
      'exit_notes',
    ],
  ];
  for (const p of book.positions)
    rows.push([
      p.origin,
      p.setup.symbol,
      p.enteredAt,
      p.entry,
      p.quantity,
      p.setup.stop,
      p.setup.target,
      p.plannedRisk,
      p.exitedAt,
      p.exit,
      p.exitReason,
      p.charges,
      p.exitedAt
        ? Math.round(((p.exit! - p.entry) * p.quantity - p.charges!) * 100) /
          100
        : '',
      p.notes,
      p.exitNotes,
    ]);
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
export { captureComparison, quoteProblem };
