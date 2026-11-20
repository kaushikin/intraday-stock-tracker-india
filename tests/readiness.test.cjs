require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  estimateCashCharges,
  cashCostScenario,
} = require('../lib/brokerCharges.ts');
const feed = require('../lib/feedStatus.ts');
const r = require('../lib/researchEvidence.ts');
const b = require('../lib/paperBook.ts');
const f = require('./readiness-fixtures.cjs');
const scenario = {
  entry: 200,
  stop: 196,
  target: 208,
  quantity: 9,
  slippage: 1,
  roundingReserve: 0.5,
  riskBudget: 50,
  cash: 9500,
};
const snapshot = () =>
  r.captureComparison('SBIN', f.quote, f.bars(), f.bars(24000), f.now);
const comparison = () => {
  const s = snapshot();
  return r.recordComparison(
    b.emptyPaperBook(),
    ['SBIN'],
    s,
    f.broker(s),
    f.now
  );
};
const charge = {
  source: 'BROKER_CALCULATOR',
  reference: 'Calculator comparison',
  tradeDate: '2026-11-20',
  entry: 200,
  exit: 208,
  quantity: 9,
  brokerTotal: 12.5,
  notes: 'One buy and one sell',
};

test('Angel charges preserve tiny levies without double counting IPFT', () => {
  const c = estimateCashCharges(200, 208, 9);
  assert.equal(c.brokerage, 10);
  assert.equal(c.total, 12.46);
  assert.ok(Math.abs(c.exchange - 0.112726728) < 1e-12);
  assert.ok(Math.abs(c.ipft - 0.000003672) < 1e-12);
  assert.ok(Math.abs(c.gst - 1.820952432) < 1e-10);
  assert.equal(estimateCashCharges(200, 196, 9).total, 12.43);
  assert.equal(estimateCashCharges(200, 208, 200).brokerage, 40);
  for (const values of [
    [200, 208, 0],
    [200, 208, 1.5],
    [-200, 208, 9],
    [NaN, 208, 9],
  ])
    assert.throws(() => estimateCashCharges(...values));
});
test('a cost scenario can fit ₹50 but fail unchanged net reward/risk', () => {
  const s = cashCostScenario(scenario);
  assert.equal(s.risk, 49.96);
  assert.equal(s.reward, 58.04);
  assert.equal(s.eligible, false);
  assert.match(s.reasons.join(' '), /reward\/risk/);
  const conditional = cashCostScenario({
    ...scenario,
    slippage: 0.25,
    roundingReserve: 0,
  });
  assert.equal(conditional.eligible, true);
  assert.equal(conditional.risk, 48.71);
  assert.equal(cashCostScenario({ ...scenario, quantity: 10 }).eligible, false);
  assert.equal(
    cashCostScenario({
      ...scenario,
      slippage: 0.25,
      roundingReserve: 0,
      cash: 1800,
    }).eligible,
    false
  );
  assert.throws(() => cashCostScenario({ ...scenario, slippage: -1 }));
});
test('feed status separates response success, freshness, depth and closed-session snapshots', () => {
  assert.equal(feed.describeQuote(f.quote, f.now).label, 'Current');
  assert.equal(
    feed.describeQuote(
      { ...f.quote, exchangeTime: '2026-11-20T09:44:00+05:30' },
      f.now
    ).label,
    'Stale / invalid'
  );
  assert.equal(
    feed.describeQuote({ ...f.quote, askQuantity: 0 }, f.now).label,
    'Depth unavailable'
  );
  assert.equal(feed.describeQuote(undefined, f.now).healthy, false);
  assert.equal(
    feed.describeQuote(f.quote, new Date('2026-11-21T10:00:00+05:30')).label,
    'Session closed'
  );
  assert.equal(feed.describeCandles(f.bars(), f.now).healthy, true);
  assert.equal(feed.describeCandles(f.bars().slice(-2), f.now).healthy, false);
  assert.equal(
    feed.describeCandles(f.bars(), new Date('2027-01-04T10:00:00+05:30'))
      .healthy,
    false
  );
  assert.deepEqual(
    feed.requestErrors(
      { errors: [{ symbols: ['SBIN'], error: 'Timeout' }] },
      ['SBIN', 'TCS'],
      []
    ),
    [
      { symbol: 'SBIN', message: 'Timeout' },
      { symbol: 'TCS', message: 'Provider returned no data for this symbol.' },
    ]
  );
});
test('supervised capture requires an open session, fresh quote and aligned complete stock/index bars', () => {
  const s = snapshot();
  assert.equal(s.stock.time, '2026-11-20T04:10:00.000Z');
  assert.throws(
    () =>
      r.captureComparison(
        'SBIN',
        f.quote,
        f.bars(),
        f.bars(),
        new Date('2026-11-21T10:00:00+05:30')
      ),
    /regular NSE/
  );
  assert.throws(
    () =>
      r.captureComparison(
        'SBIN',
        { ...f.quote, exchangeTime: '2026-11-19T04:15:00Z' },
        f.bars(),
        f.bars(),
        f.now
      ),
    /stale/
  );
  assert.throws(
    () => r.captureComparison('SBIN', f.quote, f.bars(), [], f.now),
    /warm-up/
  );
  assert.throws(
    () =>
      r.captureComparison(
        'SBIN',
        f.quote,
        f.bars(),
        f.bars().slice(0, -1),
        f.now
      ),
    /aligned/
  );
  assert.throws(
    () =>
      r.captureComparison(
        'SBIN',
        { ...f.quote, instrumentAsOf: '2026-11-19' },
        f.bars(),
        f.bars(),
        f.now
      ),
    /metadata/
  );
});
test('comparison records independently entered timestamps, OHLC and volume; failure revokes today’s pass', () => {
  const s = snapshot(),
    matched = comparison();
  assert.equal(r.comparisonReady(matched, 'SBIN', f.now), true);
  const mismatched = {
    ...f.broker(s),
    barTime: '2026-11-20T09:35:00+05:30',
    stock: { ...s.stock, volume: 101 },
  };
  const next = r.recordComparison(matched, ['TCS'], s, mismatched, f.now);
  assert.deepEqual(next.research.symbols, ['SBIN']);
  assert.equal(r.comparisonReady(next, 'SBIN', f.now), false);
  assert.equal(next.research.comparisons[1].issues.length, 2);
  assert.equal(
    r.comparisonReady(matched, 'SBIN', new Date('2026-11-23T10:00:00+05:30')),
    false
  );
  assert.throws(
    () =>
      r.recordComparison(
        matched,
        ['SBIN'],
        { ...s, symbol: 'TCS' },
        f.broker(s),
        f.now
      ),
    /outside/
  );
  assert.throws(
    () =>
      r.recordComparison(
        matched,
        ['SBIN'],
        s,
        f.broker(s),
        new Date(f.now.getTime() + 300001)
      ),
    /five minutes/
  );
  assert.throws(
    () =>
      r.recordComparison(
        matched,
        ['SBIN'],
        s,
        {
          ...f.broker(s),
          quoteTime: new Date(f.now.getTime() + 6000).toISOString(),
        },
        f.now
      ),
    /future/
  );
});
test('research backup round-trips without changing old journals; tampered passes and records reject', () => {
  const matched = comparison();
  assert.deepEqual(b.parsePaperBook(JSON.stringify(matched), f.now), matched);
  assert.deepEqual(
    b.parsePaperBook(JSON.stringify(b.emptyPaperBook()), f.now),
    b.emptyPaperBook()
  );
  for (const mutate of [
    (x) => (x.research.comparisons[0].passed = false),
    (x) =>
      (x.research.comparisons[0].broker.barTime = '2026-11-20T09:35:00+05:30'),
    (x) => x.research.comparisons.push(x.research.comparisons[0]),
    (x) =>
      (x.research.comparisons[0].snapshot.index.time =
        '2026-11-20T09:35:00+05:30'),
  ]) {
    const invalid = structuredClone(matched);
    mutate(invalid);
    assert.throws(() => b.parsePaperBook(JSON.stringify(invalid), f.now));
  }
});
test('broker charge evidence requires a real date and source and preserves computed discrepancy', () => {
  const saved = r.recordChargeCheck(
    b.emptyPaperBook(),
    ['SBIN'],
    charge,
    f.now
  );
  assert.equal(saved.research.chargeChecks[0].difference, 0.04);
  assert.deepEqual(b.parsePaperBook(JSON.stringify(saved), f.now), saved);
  for (const delta of [
    { reference: '' },
    { source: 'APP_ESTIMATE' },
    { tradeDate: '2026-03-99' },
    { tradeDate: '2026-04-31' },
    { tradeDate: '2026-11-22' },
    { brokerTotal: -1 },
  ])
    assert.throws(() =>
      r.recordChargeCheck(
        b.emptyPaperBook(),
        ['SBIN'],
        { ...charge, ...delta },
        f.now
      )
    );
  saved.research.chargeChecks[0].estimatedTotal = 0;
  assert.throws(() => b.parsePaperBook(JSON.stringify(saved), f.now));
});
test('five unique supervised session reviews never count as trades or performance approval', () => {
  let book = b.emptyPaperBook();
  const input = {
    notes: 'Compared feeds; no qualifying trade.',
    missedOpportunities: 0,
    rulesFollowed: true,
  };
  assert.throws(
    () =>
      r.recordSessionReview(
        book,
        ['SBIN'],
        input,
        new Date('2026-11-21T12:00:00+05:30')
      ),
    /regular/
  );
  assert.throws(
    () =>
      r.recordSessionReview(
        book,
        ['SBIN'],
        input,
        new Date('2026-11-20T12:00:00+05:30')
      ),
    /first/
  );
  assert.throws(
    () => r.recordFiveSessionReview(book, ['SBIN'], 'Review', f.now),
    /five/
  );
  for (const day of ['16', '17', '18', '19', '20']) {
    const at = new Date(`2026-11-${day}T12:00:00+05:30`);
    book = {
      ...book,
      observations: [
        ...book.observations,
        {
          id: `obs-${day}`,
          at: `2026-11-${day}T10:00:00+05:30`,
          symbol: 'SBIN',
          reason: 'No setup',
        },
      ],
    };
    book = r.recordSessionReview(book, ['SBIN'], input, at);
    assert.throws(
      () => r.recordSessionReview(book, ['SBIN'], input, at),
      /twice/
    );
  }
  const now = new Date('2026-11-20T12:01:00+05:30');
  book = r.recordFiveSessionReview(
    book,
    ['SBIN'],
    'No parameters changed; review provider latency.',
    now
  );
  assert.equal(book.research.sessions.length, 5);
  assert.equal(b.paperStats(book).count, 0);
  assert.equal(b.paperStats(book).sessions, 0);
  assert.deepEqual(b.parsePaperBook(JSON.stringify(book), now), book);
  book.research.fiveSessionReview.at = '2026-11-19T12:00:00+05:30';
  assert.throws(
    () => b.parsePaperBook(JSON.stringify(book), now),
    /five-session/
  );
});
