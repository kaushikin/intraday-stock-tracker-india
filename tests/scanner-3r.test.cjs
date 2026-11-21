require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const engine = require('../lib/paperStrategy.ts');
const scan = require('../lib/scanner3R.ts');
const journal = require('../lib/scannerJournal.ts');
const paper = require('../lib/paperBook.ts');
const fees = require('../lib/brokerCharges.ts');
const f = require('./scanner-journal-fixtures.cjs');
const legacyOpen = require('./fixtures/scanner-v1-open.json');
const legacyClosed = require('./fixtures/scanner-v1-closed.json');
const screen = (config = scan.DEFAULT_SCAN_CONFIG_3R, quote = f.quote) =>
  scan.screenScanner3R(
    'SBIN',
    quote,
    f.setupBars(),
    f.setupBars(),
    config,
    f.now
  );

test('3R is a distinct closed-candle setup; Practice retains its exact 2R target and identity', () => {
  const old = engine.findPaperSetup(
    'SBIN',
    f.setupBars(),
    f.setupBars(),
    f.quote,
    f.now
  ).setup;
  const next = engine.findScanner3RSetup(
    'SBIN',
    f.setupBars(),
    f.setupBars(),
    f.quote,
    f.now
  ).setup;
  assert.equal(old.version, engine.STRATEGY_VERSION);
  assert.equal(old.target, 216.65);
  assert.equal(next.version, engine.SCANNER_3R_VERSION);
  assert.equal(next.target, 223.87);
  assert.notEqual(next.id, old.id);
  assert.equal(next.entry, old.entry);
  assert.equal(next.stop, old.stop);
  assert.equal(
    paper.previewPaperEntry(paper.emptyPaperBook(), next, f.quote, 15, 5, f.now)
      .allowed,
    false
  );
  const bars = f.setupBars();
  bars.find((x) => x.time.startsWith('2026-11-19')).high = 218;
  assert.ok(
    engine.findPaperSetup('SBIN', bars, f.setupBars(), f.quote, f.now).setup
  );
  const blocked = engine.findScanner3RSetup(
    'SBIN',
    bars,
    f.setupBars(),
    f.quote,
    f.now
  );
  assert.equal(blocked.setup, undefined);
  assert.match(blocked.reasons.join(' '), /3×/);
});

test('active scanner uses full reserves, fixed targets, cash/depth limits and no optimistic fallback', () => {
  const result = screen();
  assert.equal(result.status, 'SHORTLIST', result.reasons.join(' '));
  assert.equal(result.plan.quantity, 4);
  assert.equal(result.plan.executionReserve, 5);
  assert.equal(result.plan.taxReserve, 1);
  assert.ok(result.plan.risk <= 50);
  assert.ok(result.plan.quantity * result.plan.entry <= 5000);
  assert.ok(result.plan.cashRequired <= 9500);
  const late = screen(scan.DEFAULT_SCAN_CONFIG_3R, {
    ...f.quote,
    ask: 202.5,
    bid: 202.49,
  });
  assert.equal(late.plan.target, result.plan.target);
  assert.ok(late.plan.netRR < result.plan.netRR);
  assert.equal(
    screen(scan.DEFAULT_SCAN_CONFIG_3R, { ...f.quote, ask: 204 }).status,
    'WATCH'
  );
  assert.equal(
    screen({ ...scan.DEFAULT_SCAN_CONFIG_3R, slippage: 8 }).status,
    'WATCH'
  );
  assert.equal(
    screen({ ...scan.DEFAULT_SCAN_CONFIG_3R, extraCharges: 20 }).status,
    'WATCH'
  );
  assert.equal(
    screen(scan.DEFAULT_SCAN_CONFIG_3R, { ...f.quote, askQuantity: 1 }).status,
    'WATCH'
  );
  assert.equal(
    screen(scan.DEFAULT_SCAN_CONFIG_3R, {
      ...f.quote,
      exchangeTime: '2026-11-20T09:44:00+05:30',
    }).status,
    'UNAVAILABLE'
  );
  for (const delta of [
    { slippage: 4.99 },
    { roundingReserve: 0.99 },
    { riskBudget: 50.01 },
    { cash: 9500.01 },
    { extraCharges: -1 },
  ])
    assert.throws(() => screen({ ...scan.DEFAULT_SCAN_CONFIG_3R, ...delta }));
  const forged = { ...result.setup, target: result.setup.target + 1 };
  assert.equal(
    scan.sizeScanner3RSetup(forged, f.quote, scan.DEFAULT_SCAN_CONFIG_3R, f.now)
      .plan,
    undefined
  );
});

test('execution reserve scales with spread and quantity, and the original trigger anchors the guard', () => {
  const setup = { ...screen().setup, entry: 200, stop: 196.88, target: 209.36 };
  const quote = { ...f.quote, price: 200, ask: 200, bid: 199.74 };
  const sized = scan.sizeScanner3RSetup(
    setup,
    quote,
    scan.DEFAULT_SCAN_CONFIG_3R,
    f.now
  );
  assert.deepEqual(sized.reasons, []);
  assert.equal(sized.plan.quantity, 10);
  assert.ok(Math.abs(sized.plan.executionReserve - 5.2) < 1e-8);
  assert.equal(sized.plan.risk, 49.94);
  const tooLarge = { ...setup, entry: 6000, stop: 5990, target: 6030 };
  assert.equal(
    scan.sizeScanner3RSetup(
      tooLarge,
      { ...quote, price: 6000, ask: 6000, bid: 5999.99 },
      scan.DEFAULT_SCAN_CONFIG_3R,
      f.now
    ).plan,
    undefined
  );
});

test('old backups round-trip unchanged; legacy open positions retain their target and can still close', () => {
  const later = new Date(f.now.getTime() + 120000);
  for (const old of [legacyOpen, legacyClosed])
    assert.deepEqual(journal.parseScannerBook(JSON.stringify(old), later), old);
  const p = legacyOpen.positions[0];
  const closed = journal.closeScannerPosition(
    legacyOpen,
    p.id,
    p.setup.target,
    fees.estimateCashCharges(p.entry, p.setup.target, p.quantity).total,
    'TARGET',
    later.toISOString(),
    'Observed historical fixture exit.',
    later
  );
  assert.equal(closed.version, 2);
  assert.deepEqual(closed.positions[0].setup, p.setup);
  assert.equal(closed.positions[0].plannedRisk, p.plannedRisk);
  assert.equal(closed.positions[0].slippageAllowance, p.slippageAllowance);
  assert.equal(journal.scannerStats(closed).count, 0);
  assert.equal(journal.scannerStats(closed, engine.STRATEGY_VERSION).count, 1);
  assert.deepEqual(
    journal.parseScannerBook(JSON.stringify(closed), later),
    closed
  );
});

test('journal captures the calculated execution reserve when it exceeds the entered floor', () => {
  const c = f.context();
  c.data.candles.SBIN.at(-1).low = 194.42;
  c.data.quotes.SBIN.bid = 201.56;
  const snap = journal.captureComparison(
    'SBIN',
    c.data.quotes.SBIN,
    c.data.candles.SBIN,
    c.data.candles.NIFTY,
    f.now
  );
  let book = journal.saveScannerComparison(
    journal.emptyScannerBook(),
    snap,
    f.broker(snap),
    f.now
  );
  const preview = journal.previewScannerEntry(
    book,
    paper.emptyPaperBook(),
    f.fixed,
    c,
    f.now
  );
  assert.equal(preview.result.status, 'SHORTLIST');
  book = journal.saveScannerFees(
    book,
    {
      symbol: 'SBIN',
      key: preview.key,
      atStop: preview.result.plan.atStop.total,
      atTarget: preview.result.plan.atTarget.total,
      source: 'BROKER_CALCULATOR',
      reference: 'Synthetic cost verification',
    },
    f.now
  );
  const entered = journal.openScannerPosition(
    book,
    paper.emptyPaperBook(),
    f.fixed,
    c,
    'Supervised fixture.',
    true,
    f.now
  );
  const p = entered.positions[0];
  assert.equal(p.proof.config.slippage, 5);
  assert.ok(Math.abs(p.slippageAllowance - 5.2) < 1e-8);
  assert.equal(p.plannedRisk, 49.52);
  assert.deepEqual(
    journal.parseScannerBook(JSON.stringify(entered), f.now),
    entered
  );
});

test('new entries preserve historical rows and keep statistics/CSV separate across a merged backup', () => {
  const previous = JSON.parse(
    JSON.stringify(legacyClosed).replaceAll('2026-11-20', '2026-11-19')
  );
  const oldBytes = JSON.stringify(previous.positions);
  const v = f.verified();
  const combined = journal.mergeScannerBackup(
    previous,
    v.book,
    paper.emptyPaperBook(),
    f.now
  );
  const next = journal.openScannerPosition(
    combined,
    paper.emptyPaperBook(),
    f.fixed,
    v.context,
    'Checked independently.',
    true,
    f.now
  );
  assert.equal(
    JSON.stringify(
      next.positions.filter((p) => p.setup.version === engine.STRATEGY_VERSION)
    ),
    oldBytes
  );
  const p = next.positions.at(-1),
    later = new Date(f.now.getTime() + 60000);
  const floor =
    fees.estimateCashCharges(p.entry, p.setup.target, p.quantity).total +
    p.proof.config.roundingReserve +
    p.proof.config.extraCharges;
  assert.throws(
    () =>
      journal.closeScannerPosition(
        next,
        p.id,
        p.setup.target,
        floor - 0.01,
        'TARGET',
        later.toISOString(),
        'Observed',
        later
      ),
    /rounding/
  );
  const closed = journal.closeScannerPosition(
    next,
    p.id,
    p.setup.target,
    floor,
    'TARGET',
    later.toISOString(),
    'Observed',
    later
  );
  assert.equal(journal.scannerStats(closed).count, 1);
  assert.equal(journal.scannerStats(closed, engine.STRATEGY_VERSION).count, 1);
  const csv = journal.scannerCSV(closed);
  assert.match(csv, /strategy_version/);
  assert.match(csv, /scanner-cash-3r-v2/);
  assert.doesNotMatch(csv, /cash-pullback-v1/);
  assert.match(
    journal.scannerCSV(closed, engine.STRATEGY_VERSION),
    /cash-pullback-v1/
  );
  assert.deepEqual(
    journal.parseScannerBook(JSON.stringify(closed), later),
    closed
  );
  const downgrade = structuredClone(closed);
  downgrade.version = 1;
  assert.throws(() =>
    journal.parseScannerBook(JSON.stringify(downgrade), later)
  );
});

test('single-entry rule is enforced across versions and Practice, including after closing a 3R trade', () => {
  const v = f.entered(),
    p = v.book.positions[0],
    later = new Date(f.now.getTime() + 60000);
  const closed = journal.closeScannerPosition(
    v.book,
    p.id,
    p.entry,
    15,
    'MANUAL',
    later.toISOString(),
    'Observed',
    later
  );
  const context = f.context('BSE');
  context.data.quotes.BSE.exchangeTime = later.toISOString();
  context.data.quotes.BSE.lastUpdated = later.toISOString();
  assert.match(
    journal
      .previewScannerEntry(
        closed,
        paper.emptyPaperBook(),
        f.fixed,
        context,
        later
      )
      .reasons.join(' '),
    /one entry per day/
  );
  assert.match(
    journal
      .sharedEntryReasons(closed, paper.emptyPaperBook(), 20, 500, later)
      .join(' '),
    /single-entry allowance/
  );
  const historical = journal.parseScannerBook(
    JSON.stringify(legacyClosed),
    later
  );
  assert.match(
    journal
      .previewScannerEntry(
        historical,
        paper.emptyPaperBook(),
        f.fixed,
        context,
        later
      )
      .reasons.join(' '),
    /one entry per day/
  );
  const other = {
    ...paper.emptyPaperBook(),
    positions: [
      {
        ...p,
        enteredAt: '2026-11-20T05:00:00.000Z',
        exitedAt: '2026-11-20T05:05:00.000Z',
        exit: p.entry,
        charges: 15,
      },
    ],
  };
  assert.throws(
    () => journal.assertNoSharedOverlap(closed, other),
    /single-entry/
  );
});
