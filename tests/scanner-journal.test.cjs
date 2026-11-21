require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const j = require('../lib/scannerJournal.ts'),
  b = require('../lib/paperBook.ts'),
  f = require('./scanner-journal-fixtures.cjs');
const fees = require('../lib/brokerCharges.ts');

test('scanner entry captures evidence, accepts new constituents and never changes the study book', () => {
  const study = b.emptyPaperBook(),
    before = JSON.stringify(study);
  for (const symbol of ['SBIN', 'BSE', 'TMPV', 'JIOFIN']) {
    const v = f.verified(symbol),
      next = j.openScannerPosition(
        v.book,
        study,
        f.fixed,
        v.context,
        'Reviewed events and supervision.',
        true,
        f.now
      );
    assert.equal(next.positions[0].origin, j.SCANNER_BOOK_KIND);
    assert.equal(next.positions[0].quantity, 5);
    assert.deepEqual(j.parseScannerBook(JSON.stringify(next), f.now), next);
  }
  assert.equal(JSON.stringify(study), before);
  assert.equal(b.paperStats(study).count, 0);
});
test('missing/mismatched comparisons and incomplete or insufficient fee checks block entry', () => {
  const v = f.verified();
  assert.equal(
    j.previewScannerEntry(
      j.emptyScannerBook(),
      b.emptyPaperBook(),
      f.fixed,
      v.context,
      f.now
    ).allowed,
    false
  );
  const mismatch = j.saveScannerComparison(
    v.book,
    v.snap,
    { ...v.broker, stock: { ...v.broker.stock, volume: 999 } },
    f.now
  );
  assert.match(
    j
      .previewScannerEntry(
        mismatch,
        b.emptyPaperBook(),
        f.fixed,
        v.context,
        f.now
      )
      .reasons.join(' '),
    /matching broker/
  );
  const expensive = structuredClone(v.book);
  expensive.feeChecks[0].atStop = 100;
  assert.match(
    j
      .previewScannerEntry(
        expensive,
        b.emptyPaperBook(),
        f.fixed,
        v.context,
        f.now
      )
      .reasons.join(' '),
    /Broker fees/
  );
  assert.throws(
    () =>
      j.openScannerPosition(
        v.book,
        b.emptyPaperBook(),
        f.fixed,
        v.context,
        '',
        false,
        f.now
      ),
    /Review events/
  );
  assert.throws(
    () =>
      j.saveScannerComparison(
        v.book,
        v.snap,
        v.broker,
        new Date(f.now.getTime() + 301000)
      ),
    /five minutes/
  );
});
test('entries fail closed for study shares, stale data, expired setup, changed costs and missing membership', () => {
  const v = f.verified();
  for (const [mutate, regex] of [
    [
      (c) => (c.data.quotes.SBIN.exchangeTime = '2026-11-20T09:44:00+05:30'),
      /stale/,
    ],
    [(c) => (c.config.extraCharges = 30), /reward\/risk|fee|quantity/i],
    [(c) => (c.universe.asOf = '2026-11-19'), /membership/],
    [(c) => (c.data.errors.SBIN = ['Provider failed']), /Provider failed/],
  ]) {
    const c = structuredClone(v.context);
    mutate(c);
    const p = j.previewScannerEntry(
      v.book,
      b.emptyPaperBook(),
      f.fixed,
      c,
      f.now
    );
    assert.equal(p.allowed, false);
    assert.match(p.reasons.join(' '), regex);
  }
  assert.match(
    j
      .previewScannerEntry(
        v.book,
        b.emptyPaperBook(),
        ['SBIN'],
        v.context,
        f.now
      )
      .reasons.join(' '),
    /study share/
  );
  assert.throws(
    () =>
      j.openScannerPosition(
        v.book,
        b.emptyPaperBook(),
        f.fixed,
        v.context,
        'checked',
        true,
        new Date(f.now.getTime() + 600000)
      ),
    /stale|expired/
  );
});
test('shared guards prevent simultaneous positions and count combined loss/trade limits without pooling statistics', () => {
  const v = f.entered(),
    p = v.book.positions[0];
  assert.match(
    j.sharedEntryReasons(v.book, b.emptyPaperBook(), 10, 100, f.now).join(' '),
    /existing paper position/
  );
  const study = {
    ...b.emptyPaperBook(),
    positions: [
      {
        ...p,
        id: 'study-fixture',
        exitedAt: f.now.toISOString(),
        exit: p.entry - 18,
        charges: 13,
        exitReason: 'MANUAL',
      },
    ],
  };
  const account = j.sharedAccount(j.emptyScannerBook(), study, f.now);
  assert.equal(account.riskBudget, 0);
  assert.match(
    j.sharedEntryReasons(j.emptyScannerBook(), study, 20, 100, f.now).join(' '),
    /Daily loss/
  );
  const two = {
    ...study,
    positions: [
      study.positions[0],
      { ...study.positions[0], id: 'second', exit: p.entry + 20 },
    ],
  };
  assert.match(
    j.sharedEntryReasons(j.emptyScannerBook(), two, 20, 100, f.now).join(' '),
    /Two-entry/
  );
  assert.equal(j.scannerStats(j.emptyScannerBook()).count, 0);
});
test('explicit exits validate time/reason/charges, count costs once, and cannot be closed twice', () => {
  const v = f.entered(),
    p = v.book.positions[0],
    later = new Date(f.now.getTime() + 60000),
    cost = fees.estimateCashCharges(p.entry, p.setup.target, p.quantity).total;
  assert.throws(
    () =>
      j.closeScannerPosition(
        v.book,
        p.id,
        p.entry,
        13,
        'TIME',
        later.toISOString(),
        'observed',
        later
      ),
    /30-minute/
  );
  assert.throws(
    () =>
      j.closeScannerPosition(
        v.book,
        p.id,
        p.entry,
        13,
        'TARGET',
        later.toISOString(),
        'observed',
        later
      ),
    /target/
  );
  assert.throws(
    () =>
      j.closeScannerPosition(
        v.book,
        p.id,
        p.setup.target,
        0,
        'TARGET',
        later.toISOString(),
        'observed',
        later
      ),
    /below/
  );
  const closed = j.closeScannerPosition(
    v.book,
    p.id,
    p.setup.target,
    cost,
    'TARGET',
    later.toISOString(),
    'Angel One observed bid',
    later
  );
  assert.deepEqual(j.parseScannerBook(JSON.stringify(closed), later), closed);
  assert.equal(j.scannerStats(closed).count, 1);
  assert.equal(
    j.scannerStats(closed).net,
    Math.round(((p.setup.target - p.entry) * p.quantity - cost) * 100) / 100
  );
  assert.throws(
    () =>
      j.closeScannerPosition(
        closed,
        p.id,
        p.setup.target,
        cost,
        'TARGET',
        later.toISOString(),
        'observed',
        later
      ),
    /already closed/
  );
  v.context.data.quotes.SBIN.exchangeTime = later.toISOString();
  v.context.data.quotes.SBIN.lastUpdated = later.toISOString();
  assert.match(
    j
      .previewScannerEntry(
        closed,
        b.emptyPaperBook(),
        f.fixed,
        v.context,
        later
      )
      .reasons.join(' '),
    /already been entered/
  );
});
test('later failed comparisons do not invalidate historical entries, but block subsequent entries', () => {
  const v = f.entered();
  const failed = j.saveScannerComparison(
    v.book,
    v.snap,
    { ...v.broker, ltp: v.broker.ltp + 5 },
    new Date(f.now.getTime() + 1000)
  );
  assert.doesNotThrow(() =>
    j.parseScannerBook(JSON.stringify(failed), new Date(f.now.getTime() + 1000))
  );
  assert.equal(
    j.latestScannerComparison(failed, 'SBIN', new Date(f.now.getTime() + 1000))
      .passed,
    false
  );
});
test('scanner backup rejects study files and corrupt or altered entry evidence; merge preserves records', () => {
  const v = f.entered();
  assert.throws(
    () => j.parseScannerBook(JSON.stringify(b.emptyPaperBook()), f.now),
    /invalid/
  );
  assert.throws(
    () => b.parsePaperBook(JSON.stringify(v.book), f.now),
    /invalid/
  );
  const disguised = structuredClone(v.book);
  delete disguised.kind;
  assert.throws(
    () => b.parsePaperBook(JSON.stringify(disguised), f.now),
    /invalid/
  );
  for (const mutate of [
    (x) => x.positions[0].quantity++,
    (x) => (x.positions[0].proof.quote.exchangeTime = 'bad'),
    (x) => (x.positions[0].proof.comparisonId = 'unknown'),
    (x) => x.positions.push(x.positions[0]),
    (x) => (x.positions[0].entry = 0),
  ]) {
    const changed = structuredClone(v.book);
    mutate(changed);
    assert.throws(() => j.parseScannerBook(JSON.stringify(changed), f.now));
  }
  assert.deepEqual(
    j.mergeScannerBackup(v.book, v.book, b.emptyPaperBook(), f.now),
    v.book
  );
  const altered = structuredClone(v.book);
  altered.positions[0].notes = 'different';
  assert.throws(
    () => j.mergeScannerBackup(v.book, altered, b.emptyPaperBook(), f.now),
    /conflicts/
  );
  assert.throws(
    () =>
      j.mergeScannerBackup(
        j.emptyScannerBook(),
        v.book,
        { ...b.emptyPaperBook(), positions: [v.book.positions[0]] },
        f.now
      ),
    /overlaps/
  );
});
test('observations do not count as trades and CSV protects spreadsheet formula cells', () => {
  const v = f.entered(),
    note = j.addScannerObservation(
      v.book,
      'SESSION',
      'No additional candidates.',
      f.now
    );
  assert.equal(j.scannerStats(note).count, 0);
  assert.equal(
    j.parseScannerBook(JSON.stringify(note), f.now).observations.length,
    1
  );
  note.positions[0].notes = '=HYPERLINK("https://example.invalid")';
  assert.match(j.scannerCSV(note), /"'=HYPERLINK/);
});

test('open-position quote requests use current instrument resolution and reject partial provider failures', async () => {
  const { fetchScannerQuote } = require('../lib/scannerFeed.ts');
  const quote = { ...f.quote, symbol: 'SBIN', changePercent: 0 };
  let body;
  const value = await fetchScannerQuote('SBIN', new AbortController().signal, {
    fetcher: async (_url, options) => {
      body = JSON.parse(options.body);
      return Response.json({ success: true, quotes: [quote], errors: [] });
    },
  });
  assert.equal(body.items[0].token, 'SBIN');
  assert.equal(value.bid, f.quote.bid);
  await assert.rejects(
    () =>
      fetchScannerQuote('SBIN', new AbortController().signal, {
        fetcher: async () =>
          Response.json({
            success: true,
            quotes: [quote],
            errors: [{ symbol: 'SBIN', error: 'Provider failed' }],
          }),
      }),
    /Provider failed/
  );
  await assert.rejects(
    () =>
      fetchScannerQuote('SBIN', new AbortController().signal, {
        fetcher: async () =>
          Response.json({ success: true, quotes: [], errors: [] }),
      }),
    /missing|return/i
  );
});
