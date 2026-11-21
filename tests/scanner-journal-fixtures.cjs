require('./load-ts.cjs');
const f = require('./scanner-fixtures.cjs');
const j = require('../lib/scannerJournal.ts');
const n = require('../lib/nifty50.ts');
const b = require('../lib/paperBook.ts');
const fixed = ['RELIANCE', 'TCS', 'HDFCBANK'];
function context(symbol = 'SBIN') {
  return {
    symbol,
    universe: {
      members: n.parseNifty50CSV(f.csv),
      source: n.NIFTY50_SOURCE,
      asOf: '2026-11-20',
      checkedAt: f.now.toISOString(),
    },
    data: {
      quotes: { [symbol]: { ...f.quote } },
      candles: { [symbol]: f.setupBars(), NIFTY: f.setupBars() },
      errors: {},
      completedAt: f.now.toISOString(),
    },
    // Test-only favourable cost assumptions; production defaults are unchanged.
    config: {
      riskBudget: 50,
      cash: 9500,
      slippage: 0.25,
      roundingReserve: 0,
      extraCharges: 0,
    },
  };
}
function verified(symbol = 'SBIN') {
  const c = context(symbol),
    snap = j.captureComparison(
      symbol,
      c.data.quotes[symbol],
      c.data.candles[symbol],
      c.data.candles.NIFTY,
      f.now
    );
  const broker = {
    ltp: snap.ltp,
    quoteTime: snap.exchangeTime,
    barTime: snap.stock.time,
    stock: { ...snap.stock },
    index: { ...snap.index },
  };
  let book = j.saveScannerComparison(j.emptyScannerBook(), snap, broker, f.now);
  const preview = j.previewScannerEntry(
    book,
    b.emptyPaperBook(),
    fixed,
    c,
    f.now
  );
  if (!preview.key) throw new Error(JSON.stringify(preview.reasons));
  book = j.saveScannerFees(
    book,
    {
      symbol,
      key: preview.key,
      atStop: preview.result.plan.atStop.total,
      atTarget: preview.result.plan.atTarget.total,
      source: 'BROKER_CALCULATOR',
      reference: 'Independent test observation',
    },
    f.now
  );
  return { context: c, book, snap, broker };
}
function entered(symbol = 'SBIN') {
  const v = verified(symbol);
  return {
    ...v,
    book: j.openScannerPosition(
      v.book,
      b.emptyPaperBook(),
      fixed,
      v.context,
      'Event calendar checked; supervised fixture.',
      true,
      f.now
    ),
  };
}
module.exports = { ...f, fixed, context, verified, entered };
