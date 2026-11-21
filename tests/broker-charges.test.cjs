require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fees = require('../lib/brokerCharges.ts');
const research = require('../lib/researchEvidence.ts');
const paper = require('../lib/paperBook.ts');
const scanner = require('../lib/niftyScanner.ts');
const journal = require('../lib/scannerJournal.ts');
const f = require('./scanner-journal-fixtures.cjs');

test('small orders respect the legal ceiling on each leg before GST', () => {
  const small = fees.estimateCashCharges(100, 101, 1);
  assert.ok(Math.abs(small.brokerage - 5.025) < 1e-10);
  assert.equal(small.total, 5.97);
  assert.ok(
    Math.abs(fees.estimateCashCharges(199, 201, 1).brokerage - 9.975) < 1e-10
  );
  assert.equal(fees.estimateCashCharges(200, 200, 1).brokerage, 10);
  assert.equal(fees.estimateCashCharges(5, 6, 10).brokerage, 5);
  assert.equal(fees.estimateCashCharges(5, 6, 10).total, 5.93);
  assert.ok(
    Math.abs(fees.estimateCashCharges(10, 10.01, 1).brokerage - 0.50025) < 1e-10
  );
  assert.equal(fees.estimateCashCharges(200, 208, 9).total, 12.46);
  assert.equal(fees.estimateCashCharges(200, 208, 200).brokerage, 40);
  assert.throws(
    () => fees.estimateCashCharges(100, 101, 1, 'unknown'),
    /version/
  );
  assert.throws(
    () => fees.estimateCashCharges(Number.MAX_VALUE, Number.MAX_VALUE, 2),
    /range/
  );
});

test('historical charge comparisons replay their saved estimator without rewriting evidence', () => {
  const book = research.recordChargeCheck(
    paper.emptyPaperBook(),
    ['SBIN'],
    {
      source: 'BROKER_CALCULATOR',
      reference: 'Saved small-order comparison',
      tradeDate: '2026-11-20',
      entry: 100,
      exit: 101,
      quantity: 1,
      brokerTotal: 5.97,
      notes: 'Fixture only',
    },
    f.now
  );
  assert.equal(book.research.chargeChecks[0].schedule, fees.CHARGE_SCHEDULE.id);
  assert.deepEqual(paper.parsePaperBook(JSON.stringify(book), f.now), book);
  const old = structuredClone(book);
  const c = old.research.chargeChecks[0];
  c.schedule = fees.LEGACY_CHARGE_SCHEDULE_ID;
  c.estimatedTotal = 11.84;
  c.difference = -5.87;
  assert.deepEqual(paper.parsePaperBook(JSON.stringify(old), f.now), old);
  c.schedule = fees.CHARGE_SCHEDULE.id;
  assert.throws(
    () => paper.parsePaperBook(JSON.stringify(old), f.now),
    /charge comparison/
  );
});

test('old scanner backups retain their uncapped planning proof while new fee checks use the corrected version', () => {
  const book = structuredClone(require('./fixtures/scanner-v1-open.json'));
  const p = book.positions[0];
  p.setup = { ...p.setup, entry: 150, stop: 115, target: 220 };
  p.proof.quote = { ...p.proof.quote, price: 150, ask: 150, bid: 149.99 };
  delete p.proof.chargeSchedule;
  const plan = scanner.sizeScannerSetup(
    p.setup,
    p.proof.quote,
    p.proof.config,
    f.now,
    fees.LEGACY_CHARGE_SCHEDULE_ID
  ).plan;
  assert.ok(plan?.eligible);
  p.proof.plan = plan;
  p.entry = plan.entry;
  p.quantity = plan.quantity;
  p.plannedRisk = plan.risk;
  p.estimatedCharges = plan.planningCharges;
  const check = book.feeChecks.find((x) => x.id === p.proof.feeId);
  check.key = journal.scannerFeeKey(
    p.setup.symbol,
    p.setup.id,
    plan,
    p.proof.config,
    fees.LEGACY_CHARGE_SCHEDULE_ID
  );
  check.atStop = plan.atStop.total;
  check.atTarget = plan.atTarget.total;
  assert.deepEqual(journal.parseScannerBook(JSON.stringify(book), f.now), book);
  assert.notEqual(
    check.key,
    journal.scannerFeeKey(p.setup.symbol, p.setup.id, plan, p.proof.config)
  );
  p.proof.chargeSchedule = fees.CHARGE_SCHEDULE.id;
  assert.throws(() => journal.parseScannerBook(JSON.stringify(book), f.now));
});

test('Practice uses full quantity-specific charges and permits the legal small-order cap', () => {
  const quote = { ...f.quote, price: 200, ask: 200, bid: 199.99 };
  const setup = {
    id: 'cash-pullback-v1:SBIN:charge-fixture',
    version: 'cash-pullback-v1',
    symbol: 'SBIN',
    side: 'BUY',
    entry: 200,
    stop: 196,
    target: 208,
    tickSize: 0.01,
    barTime: '2026-11-20T09:40:00+05:30',
    createdAt: '2026-11-20T09:45:00+05:30',
    expiresAt: '2026-11-20T09:55:00+05:30',
  };
  const under = paper.previewPaperEntry(
    paper.emptyPaperBook(),
    setup,
    quote,
    11.8,
    0,
    f.now
  );
  assert.equal(under.allowed, false);
  assert.match(under.reasons.join(' '), /taxes and all levies/);
  const smallSetup = { ...setup, entry: 150, stop: 115, target: 220 };
  const small = paper.previewPaperEntry(
    paper.emptyPaperBook(),
    smallSetup,
    { ...quote, price: 150, ask: 150, bid: 149.99 },
    11,
    0.25,
    f.now
  );
  assert.equal(small.allowed, true, small.reasons.join(' '));
});
