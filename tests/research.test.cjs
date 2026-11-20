require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const quality = require('../lib/marketDataQuality.ts');
const { addIndicators } = require('../lib/technicalIndicators.ts');
const { analyzeMarketCondition } = require('../lib/marketCondition.ts');
const hours = require('../lib/marketHours.ts');
const { calculatePositionSizing } = require('../lib/positionSizing.ts');
const { parseCashMaster } = require('../lib/cashInstruments.ts');
const { findPaperSetup, STRATEGY_VERSION } = require('../lib/paperStrategy.ts');
const { parseSentiment, recentHeadlines } = require('../lib/sentiment.ts');
const book = require('../lib/paperBook.ts');
const now = new Date('2026-11-20T09:45:05+05:30');
const candle = (time, close = 100, volume = 100) => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume,
});
const quote = (overrides = {}) => ({
  price: 200,
  change: 0,
  ask: 200,
  bid: 199.99,
  askQuantity: 100,
  tickSize: 0.01,
  instrumentAsOf: '2026-11-20',
  exchangeTime: now.toISOString(),
  lastUpdated: now.toISOString(),
  ...overrides,
});
const setup = {
  id: 'cash-pullback-v1:SBIN:fixture',
  version: STRATEGY_VERSION,
  symbol: 'SBIN',
  side: 'BUY',
  barTime: '2026-11-20T09:40:00+05:30',
  createdAt: '2026-11-20T09:45:00+05:30',
  expiresAt: '2026-11-20T09:55:00+05:30',
  entry: 200,
  stop: 196,
  target: 208,
  tickSize: 0.01,
};
function open() {
  return book.openPaperPosition(
    book.emptyPaperBook(),
    setup,
    quote(),
    13,
    0,
    'Events checked; paper fixture',
    now
  );
}
function close(
  b,
  exit = 208,
  charges = 13,
  reason = 'MANUAL',
  time = '2026-11-20T10:00:00+05:30'
) {
  return book.closePaperPosition(
    b,
    b.positions[0].id,
    exit,
    charges,
    reason,
    time,
    new Date(time)
  );
}

test('verified calendar excludes holidays, boundaries and unknown years', () => {
  assert.equal(
    hours.getIndianMarketStatus(new Date('2026-01-15T10:00:00+05:30')),
    'HOLIDAY'
  );
  assert.equal(
    hours.getIndianMarketStatus(new Date('2026-11-24T10:00:00+05:30')),
    'HOLIDAY'
  );
  assert.equal(
    hours.getIndianMarketStatus(new Date('2026-11-20T15:30:00+05:30')),
    'AFTER_CLOSE'
  );
  assert.equal(
    hours.getIndianMarketStatus(new Date('2027-01-04T10:00:00+05:30')),
    'CALENDAR_UNVERIFIED'
  );
  assert.equal(
    hours.isFreshSignalWindowOpenIST(new Date('2026-11-20T11:15:00+05:30')),
    false
  );
  assert.equal(
    hours.istDateKey(new Date('2026-11-19T19:00:00Z')),
    '2026-11-20'
  );
});
test('provider times are explicitly IST, unknown date formats are rejected', () => {
  assert.equal(
    quality.exchangeTimestamp('20-Nov-2026 09:45:05'),
    now.toISOString()
  );
  assert.equal(
    quality.exchangeTimestamp('2026-11-20 09:45:05'),
    now.toISOString()
  );
  assert.equal(quality.exchangeTimestamp('not-a-date'), undefined);
});
test('forming/future and invalid OHLC bars are excluded, results sorted and deduplicated', () => {
  const a = candle('2026-11-20T09:35:00+05:30'),
    b = candle('2026-11-20T09:40:00+05:30');
  const result = quality.completedCandles(
    [
      b,
      a,
      a,
      candle('2026-11-20T09:45:00+05:30'),
      { ...a, time: '2026-11-20T09:30:00+05:30', high: 90 },
    ],
    now
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].time, new Date(a.time).toISOString());
});
test('missing exchange timestamps and stale quotes block even when fetched now', () => {
  assert.equal(quality.quoteProblem(quote(), now), null);
  assert.match(
    quality.quoteProblem(quote({ exchangeTime: undefined }), now),
    /timestamp/
  );
  assert.match(
    quality.quoteProblem(
      quote({ exchangeTime: '2026-11-19T09:45:00+05:30' }),
      now
    ),
    /stale/
  );
  assert.match(
    quality.quoteProblem(
      quote({ exchangeTime: '2026-11-20T10:00:00+05:30' }),
      now
    ),
    /clock/
  );
});
test('stale sessions and missing recent bars cannot pass candle checks', () => {
  const old = Array.from({ length: 150 }, (_, i) =>
    candle(
      new Date(
        Date.parse('2026-11-19T09:15:00+05:30') + i * 300000
      ).toISOString()
    )
  );
  assert.ok(quality.candleProblem(old, now));
  const current = [
    candle('2026-11-20T09:25:00+05:30'),
    candle('2026-11-20T09:35:00+05:30'),
    candle('2026-11-20T09:40:00+05:30'),
  ];
  assert.match(quality.candleProblem(current, now, 3), /missing bars/);
});
test('15-minute aggregation never constructs an incomplete or mixed-session bar', () => {
  const raw = [0, 5, 10, 15].map((n) =>
    candle(`2026-11-20T09:${String(15 + n).padStart(2, '0')}:00+05:30`, 100 + n)
  );
  const result = quality.aggregate15Minutes(quality.completedCandles(raw, now));
  assert.equal(result.length, 1);
  assert.equal(result[0].open, 100);
  assert.equal(result[0].close, 110);
  assert.equal(
    quality.aggregate15Minutes(quality.completedCandles([raw[0], raw[2]], now))
      .length,
    0
  );
});
test('Wilder RSI handles flat, rising, falling and warm-up data', () => {
  const flat = Array.from({ length: 30 }, (_, i) =>
    candle(new Date(now.getTime() - 30 * 300000 + i * 300000).toISOString())
  );
  assert.equal(addIndicators(flat).at(-1).rsi14, 50);
  assert.equal(addIndicators(flat.slice(0, 12)).at(-1).rsi14, undefined);
  assert.equal(
    addIndicators(
      flat.map((c, i) => ({
        ...c,
        close: 100 + i,
        high: 101 + i,
        low: 99 + i,
        open: 100 + i,
      }))
    ).at(-1).rsi14,
    100
  );
  assert.equal(
    addIndicators(
      flat.map((c, i) => ({
        ...c,
        close: 100 - i,
        high: 101 - i,
        low: 99 - i,
        open: 100 - i,
      }))
    ).at(-1).rsi14,
    0
  );
});
test('ADX smooths changing directional movement instead of returning last DX', () => {
  let level = 100;
  const fixture = Array.from({ length: 80 }, (_, i) => {
    level += i < 50 ? (i % 2 ? 0.8 : -0.7) : -0.3;
    return {
      open: level,
      high: level + 0.5,
      low: level - 0.5,
      close: level,
      volume: 1000,
      time: new Date(now.getTime() - 80 * 300000 + i * 300000).toISOString(),
    };
  });
  assert.ok(
    Math.abs(addIndicators(fixture).at(-1).adx14 - 47.60905304791792) < 1e-8
  );
});
test('session VWAP resets while EMA retains prior-session warm-up', () => {
  const result = addIndicators([
    candle('2026-11-19T15:25:00+05:30', 100, 10000),
    candle('2026-11-20T09:15:00+05:30', 200, 100),
  ]);
  assert.equal(result[1].vwap, 200);
  assert.ok(result[1].ema20 < 200);
  assert.equal(analyzeMarketCondition([], now).available, false);
});
test('cash sizing includes costs inside loss and cash caps, and rounds whole lots down', () => {
  const input = {
    side: 'BUY',
    entry: 200,
    stopLoss: 196,
    target: 208,
    maxRiskAmount: 50,
    estimatedCharges: 13,
    availableCapital: 9500,
  };
  assert.equal(calculatePositionSizing(input).suggestedQuantity, 9);
  assert.equal(calculatePositionSizing(input).netLossAtStop, 49);
  assert.equal(
    calculatePositionSizing({ ...input, availableCapital: 500 })
      .suggestedQuantity,
    2
  );
  assert.equal(
    calculatePositionSizing({ ...input, lotSize: 65 }).suggestedQuantity,
    0
  );
  assert.equal(
    calculatePositionSizing({ ...input, estimatedCharges: 51 })
      .suggestedQuantity,
    0
  );
  for (const bad of [NaN, Infinity, -1])
    assert.equal(
      calculatePositionSizing({ ...input, entry: bad }).suggestedQuantity,
      0
    );
});
test('instrument master accepts cash only and obtains tick size from provider metadata', () => {
  const values = parseCashMaster(
    [
      {
        name: 'SBIN',
        symbol: 'SBIN-EQ',
        token: '3045',
        exch_seg: 'NSE',
        lotsize: '1',
        tick_size: '1',
        expiry: '',
      },
      {
        name: 'RELIANCE',
        symbol: 'RELIANCE26NOVFUT',
        token: '999',
        exch_seg: 'NFO',
        lotsize: '500',
        tick_size: '5',
        expiry: '26NOV2026',
      },
    ],
    '2026-11-20'
  );
  assert.equal(values.SBIN.tickSize, 0.01);
  assert.equal(values.RELIANCE, undefined);
});
test('paper entry requires an actual trigger and cannot invent pre-entry target or stop outcomes', () => {
  const empty = book.emptyPaperBook();
  assert.throws(
    () =>
      book.openPaperPosition(
        empty,
        setup,
        quote({ ask: 195, bid: 194.99 }),
        13,
        0,
        'checked',
        now
      ),
    /trigger/
  );
  assert.throws(
    () =>
      book.openPaperPosition(
        empty,
        setup,
        quote({ ask: 209, bid: 208.99 }),
        13,
        0,
        'checked',
        now
      ),
    /chase|Invalid/
  );
  assert.equal(empty.positions.length, 0);
  assert.equal(open().positions[0].exitedAt, undefined);
});
test('one-position guard, duplicate setup guard, expired setup and stale quote block entries', () => {
  const b = open();
  assert.throws(
    () => book.openPaperPosition(b, setup, quote(), 13, 0, 'checked', now),
    /existing|already/
  );
  assert.throws(
    () =>
      book.openPaperPosition(
        book.emptyPaperBook(),
        setup,
        quote(),
        13,
        0,
        'checked',
        new Date('2026-11-20T09:55:00+05:30')
      ),
    /expired/
  );
  assert.equal(
    book.previewPaperEntry(
      book.emptyPaperBook(),
      setup,
      quote({ exchangeTime: undefined }),
      13,
      0,
      now
    ).allowed,
    false
  );
  assert.equal(
    book.previewPaperEntry(
      book.emptyPaperBook(),
      setup,
      quote({ askQuantity: 1 }),
      13,
      0,
      now
    ).allowed,
    false
  );
});
test('fees and remaining loss limits can reject a technically valid idea', () => {
  assert.equal(
    book.previewPaperEntry(book.emptyPaperBook(), setup, quote(), 15, 1, now)
      .allowed,
    false
  );
  const gapLoss = close(open(), 180, 13);
  assert.equal(
    book.paperAccount(gapLoss, new Date('2026-11-20T10:01:00+05:30'))
      .riskBudget,
    0
  );
  assert.match(
    book
      .paperAccount(gapLoss, new Date('2026-11-20T10:01:00+05:30'))
      .reasons.join(' '),
    /Daily loss/
  );
});
test('manual and time exits count; charges are deducted once and terminal records cannot close twice', () => {
  const closed = close(open(), 202, 13, 'MANUAL');
  assert.equal(book.positionPL(closed.positions[0]), 5);
  assert.equal(book.paperStats(closed).count, 1);
  assert.equal(book.paperStats(closed).wins, 1);
  assert.throws(() => close(closed), /already closed/);
  assert.throws(() => close(open(), 202, 13, 'TARGET'), /did not reach/);
  assert.throws(() => close(open(), 202, 13, 'TIME'), /not elapsed/);
  assert.equal(
    book.paperStats(close(open(), 198, 13, 'TIME', '2026-11-20T10:20:00+05:30'))
      .losses,
    1
  );
});
test('exit cannot precede entry, use a future timestamp or invalid costs', () => {
  const b = open();
  assert.throws(
    () => close(b, 198, 13, 'MANUAL', '2026-11-20T09:40:00+05:30'),
    /between/
  );
  assert.throws(
    () =>
      book.closePaperPosition(
        b,
        b.positions[0].id,
        198,
        13,
        'MANUAL',
        '2026-11-20T10:00:00+05:30',
        now
      ),
    /between/
  );
  assert.throws(() => close(b, 198, -1), /non-negative/);
});
test('restore rejects malformed/duplicate positions instead of clearing them silently', () => {
  assert.deepEqual(book.parsePaperBook(null), book.emptyPaperBook());
  assert.throws(() => book.parsePaperBook('{bad'), SyntaxError);
  const b = open();
  assert.deepEqual(book.parsePaperBook(JSON.stringify(b)), b);
  assert.throws(
    () =>
      book.parsePaperBook(
        JSON.stringify({ ...b, positions: [b.positions[0], b.positions[0]] })
      ),
    /invalid/
  );
  assert.throws(
    () =>
      book.parsePaperBook(
        JSON.stringify({
          ...b,
          positions: [{ ...b.positions[0], quantity: -1 }],
        })
      ),
    /invalid/
  );
  assert.throws(
    () =>
      book.parsePaperBook(
        JSON.stringify({ ...b, positions: [{ ...b.positions[0], exit: 208 }] })
      ),
    /incomplete exit/
  );
  assert.throws(
    () =>
      book.parsePaperBook(
        JSON.stringify({
          ...b,
          positions: [
            { ...b.positions[0], setup: { ...setup, expiresAt: 'invalid' } },
          ],
        })
      ),
    /invalid setup/
  );
  assert.throws(
    () =>
      book.parsePaperBook(
        JSON.stringify(b),
        new Date('2026-11-20T09:45:00+05:30')
      ),
    /invalid setup or entry/
  );
});
test('malformed setup expiry cannot bypass the entry guard', () => {
  assert.equal(
    book.previewPaperEntry(
      book.emptyPaperBook(),
      { ...setup, expiresAt: 'invalid' },
      quote(),
      13,
      0,
      now
    ).allowed,
    false
  );
});
test('win-rate confidence interval is distinct from model sentiment', () => {
  const base = close(open()).positions[0];
  const positions = Array.from({ length: 100 }, (_, i) => ({
    ...base,
    id: String(i),
    exit: i < 70 ? 208 : 196,
  }));
  const stats = book.paperStats({ version: 1, positions, observations: [] });
  assert.equal(stats.winRate, 70);
  assert.ok(Math.abs(stats.interval[0] - 60.4) < 0.1);
  assert.ok(Math.abs(stats.interval[1] - 78.1) < 0.1);
  assert.equal(
    parseSentiment([
      { label: 'neutral', score: 0.1 },
      { label: 'positive', score: 0.9 },
    ]).label,
    'positive'
  );
  assert.equal(
    parseSentiment([[{ label: 'negative', score: 0.7 }]]).label,
    'negative'
  );
  assert.throws(
    () => parseSentiment([{ label: 'positive', score: 2 }]),
    /Invalid/
  );
});
test('news context rejects old, undated, future and duplicate headlines', () => {
  const headline = {
    title: 'Company reports earnings',
    link: 'https://example.com/news',
    publishedAt: now.toISOString(),
  };
  assert.equal(
    recentHeadlines(
      [
        headline,
        headline,
        { ...headline, title: 'Old', publishedAt: '2026-11-18T10:00:00Z' },
        { ...headline, title: 'Unknown', publishedAt: '' },
      ],
      now
    ).length,
    1
  );
});

function strategyFixture() {
  const bars = [];
  for (const day of ['16', '17', '18', '19'])
    for (let i = 0; i < 75; i++)
      bars.push(
        candle(
          new Date(
            Date.parse(`2026-11-${day}T09:15:00+05:30`) + i * 300000
          ).toISOString(),
          180 + bars.length * 0.05
        )
      );
  for (let i = 0; i < 5; i++)
    bars.push(
      candle(
        new Date(
          Date.parse('2026-11-20T09:15:00+05:30') + i * 300000
        ).toISOString(),
        200 + i * 0.2
      )
    );
  bars.push({
    time: '2026-11-20T09:40:00+05:30',
    open: 200,
    high: 202.2,
    low: 195,
    close: 202.1,
    volume: 100,
  });
  return bars;
}
test('strategy creates an immutable closed-bar setup and excludes a forming future candle', () => {
  const bars = strategyFixture();
  const result = findPaperSetup('SBIN', bars, bars, quote(), now);
  assert.ok(result.setup, result.reasons.join(' '));
  assert.equal(result.setup.entry, 202.21);
  assert.equal(result.setup.stop, 194.99);
  const future = {
    ...bars.at(-1),
    time: '2026-11-20T09:45:00+05:30',
    high: 999,
  };
  assert.deepEqual(
    findPaperSetup('SBIN', [...bars, future], [...bars, future], quote(), now)
      .setup,
    result.setup
  );
  assert.equal(findPaperSetup('SBIN', bars, [], quote(), now).setup, undefined);
});
