require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const f = require('./scanner-fixtures.cjs');
const universeModule = require('../lib/nifty50.ts');
const s = require('../lib/niftyScanner.ts');
const feed = require('../lib/scannerFeed.ts');
const { parseCashMaster } = require('../lib/cashInstruments.ts');
const members = universeModule.parseNifty50CSV(f.csv);
const universe = {
  members,
  source: universeModule.NIFTY50_SOURCE,
  asOf: '2026-11-20',
  checkedAt: f.now.toISOString(),
};
const verifiedExample = {
  ...s.DEFAULT_SCAN_CONFIG,
  slippage: 0.25,
  roundingReserve: 0,
};
const screen = (config = verifiedExample, quote = f.quote, now = f.now) =>
  s.screenCandidate('SBIN', quote, f.setupBars(), f.setupBars(), config, now);
const freshController = () => new AbortController();
const runtime = {
  now: () => f.now,
  pause: async (_ms, signal) => signal.throwIfAborted(),
};

test('official constituent parsing requires a complete unique EQ list and accepts quoted names', () => {
  assert.equal(members.length, 50);
  assert.ok(members.some((m) => m.symbol === 'ETERNAL'));
  const quoted = f.csv.replace(
    'Adani Enterprises Ltd.',
    '"Adani Enterprises, Ltd."'
  );
  assert.ok(
    universeModule
      .parseNifty50CSV(quoted)
      .some((m) => m.name === 'Adani Enterprises, Ltd.')
  );
  for (const text of [
    f.csv.split('\n').slice(0, 50).join('\n'),
    '<html>blocked</html>',
    f.csv.replace(',EQ,', ',BE,'),
    f.csv.replace('ADANIPORTS', 'ADANIENT'),
    f.csv + 'Unclosed,"',
  ])
    assert.throws(() => universeModule.parseNifty50CSV(text));
});
test('current constituent instruments absent from the old list resolve without admitting futures', () => {
  const rows = [
    {
      name: 'ETERNAL',
      symbol: 'ETERNAL-EQ',
      token: '123',
      exch_seg: 'NSE',
      lotsize: '1',
      tick_size: '1',
      expiry: '',
    },
    {
      name: 'ETERNAL',
      symbol: 'ETERNAL26NOVFUT',
      token: '456',
      exch_seg: 'NFO',
      lotsize: '100',
      tick_size: '5',
      expiry: '26NOV2026',
    },
  ];
  const result = parseCashMaster(rows, '2026-11-20');
  assert.equal(result.ETERNAL.token, '123');
  assert.equal(result.ETERNAL.tickSize, 0.01);
});
test('scanner reuses the actual setup engine and sizes exact quantity-dependent fees', () => {
  const result = screen();
  assert.equal(result.status, 'SHORTLIST', result.reasons.join(' '));
  assert.equal(result.setup.entry, 202.21);
  assert.equal(result.plan.quantity, 5);
  assert.ok(result.plan.risk <= 50);
  assert.ok(result.plan.netRR >= 1.2);
  assert.ok(result.plan.cashRequired <= 9500);
  assert.ok(
    result.plan.planningCharges >=
      Math.max(result.plan.atStop.total, result.plan.atTarget.total)
  );
  const defaultResult = screen(s.DEFAULT_SCAN_CONFIG);
  assert.equal(defaultResult.status, 'WATCH');
  assert.match(defaultResult.reasons.join(' '), /reward\/risk|quantity/);
  assert.equal(
    screen({ ...verifiedExample, extraCharges: 30 }).status,
    'WATCH'
  );
  assert.equal(screen({ ...verifiedExample, cash: 400 }).status, 'WATCH');
  assert.equal(
    screen(verifiedExample, { ...f.quote, askQuantity: 1 }).status,
    'WATCH'
  );
});
test('scanner rejects stale data, missing index, future quotes, late fills and excessive spread', () => {
  assert.equal(
    screen(verifiedExample, {
      ...f.quote,
      exchangeTime: '2026-11-20T09:44:00+05:30',
    }).status,
    'UNAVAILABLE'
  );
  assert.equal(
    screen(verifiedExample, {
      ...f.quote,
      exchangeTime: '2026-11-20T09:50:00+05:30',
    }).status,
    'UNAVAILABLE'
  );
  assert.equal(
    s.screenCandidate(
      'SBIN',
      f.quote,
      f.setupBars(),
      [],
      verifiedExample,
      f.now
    ).status,
    'UNAVAILABLE'
  );
  assert.equal(
    screen(verifiedExample, { ...f.quote, ask: 204 }).status,
    'WATCH'
  );
  assert.equal(
    screen(verifiedExample, { ...f.quote, bid: 200 }).status,
    'WATCH'
  );
  assert.equal(
    screen(verifiedExample, { ...f.quote, ask: 202 }).status,
    'WATCH'
  );
  assert.equal(
    screen(verifiedExample, f.quote, new Date('2026-11-20T11:15:00+05:30'))
      .status,
    'CLOSED'
  );
  assert.equal(
    screen(verifiedExample, f.quote, new Date('2026-11-21T10:00:00+05:30'))
      .status,
    'CLOSED'
  );
  assert.equal(
    s.screenCandidate(
      'SBIN',
      f.quote,
      f.setupBars(),
      f.setupBars(),
      verifiedExample,
      f.now,
      ['Provider timed out']
    ).status,
    'UNAVAILABLE'
  );
});
test('scanner cannot enlarge risk/cash or use invalid cost inputs', () => {
  for (const c of [
    { ...verifiedExample, riskBudget: 51 },
    { ...verifiedExample, cash: 10000 },
    { ...verifiedExample, slippage: NaN },
    { ...verifiedExample, extraCharges: -1 },
    { riskBudget: 50, cash: 9500 },
  ])
    assert.throws(() => s.validateScanConfig(c));
  const result = screen();
  assert.deepEqual(
    s
      .rankShortlist([
        { ...result, symbol: 'TCS' },
        { ...result, symbol: 'SBIN' },
        { ...result, status: 'WATCH', symbol: 'IGNORE' },
      ])
      .map((r) => r.symbol),
    ['SBIN', 'TCS']
  );
});
test('universe response must be complete and verified in the current IST day', async () => {
  const fetcher = async () => Response.json({ success: true, universe });
  assert.equal(
    (
      await feed.loadScannerUniverse(freshController().signal, {
        ...runtime,
        fetcher,
      })
    ).members.length,
    50
  );
  await assert.rejects(
    () =>
      feed.loadScannerUniverse(freshController().signal, {
        ...runtime,
        fetcher: async () =>
          Response.json({
            success: true,
            universe: { ...universe, asOf: '2026-11-19' },
          }),
      }),
    /membership/
  );
});
test('all 50 shares are fetched in paced sequential batches, with quotes only after candle history', async () => {
  const calls = [],
    waits = [];
  let active = 0,
    maxActive = 0;
  const fetcher = async (url, options) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    const result = url.endsWith('/candles')
      ? {
          success: true,
          candles: Object.fromEntries(
            body.symbols.map((s) => [s, f.setupBars()])
          ),
          errors: [],
        }
      : {
          success: true,
          quotes: body.items.map((x) => ({
            symbol: x.symbol,
            ...f.quote,
            changePercent: 0,
          })),
          errors: [],
        };
    active--;
    return Response.json(result);
  };
  const result = await feed.fetchScannerData(
    members.map((m) => m.symbol),
    freshController().signal,
    () => {},
    { ...runtime, fetcher, pause: async (ms) => waits.push(ms) }
  );
  assert.equal(Object.keys(result.quotes).length, 50);
  assert.equal(Object.keys(result.candles).length, 51);
  assert.deepEqual(result.errors, {});
  assert.equal(maxActive, 1);
  const candleCalls = calls.filter((c) => c.url.endsWith('/candles')),
    quoteCalls = calls.filter((c) => c.url.endsWith('/quote'));
  assert.equal(candleCalls.length, 13);
  assert.equal(quoteCalls.length, 4);
  assert.ok(candleCalls.every((c) => c.body.symbols.length <= 5));
  assert.ok(quoteCalls.every((c) => c.body.items.length <= 15));
  assert.ok(waits.every((ms) => ms >= 1000));
  assert.equal(
    calls.findIndex((c) => c.url.endsWith('/quote')),
    13
  );
  assert.deepEqual(
    quoteCalls.flatMap((c) => c.body.items.map((x) => x.symbol)),
    members.map((m) => m.symbol)
  );
});
test('partial provider failures clear even returned values and preserve missing-symbol reasons', async () => {
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    return url.endsWith('/candles')
      ? Response.json({
          success: true,
          candles: {
            SBIN: f.setupBars(),
            TCS: f.setupBars(),
            NIFTY: f.setupBars(),
          },
          errors: [{ symbol: 'SBIN', error: 'Bad candle feed' }],
        })
      : Response.json({
          success: true,
          quotes: [{ symbol: 'SBIN', ...f.quote }],
          errors: [],
        });
  };
  const result = await feed.fetchScannerData(
    ['SBIN', 'TCS'],
    freshController().signal,
    () => {},
    { ...runtime, fetcher }
  );
  assert.deepEqual(result.candles.SBIN, []);
  assert.match(result.errors.SBIN.join(' '), /Bad candle/);
  assert.equal(result.quotes.TCS, undefined);
  assert.match(result.errors.TCS.join(' '), /no data/);
});
test('cancel and login failures stop remaining batches instead of continuing requests', async () => {
  const controller = freshController();
  let count = 0;
  const fetcher = async (_url, options) => {
    count++;
    const body = JSON.parse(options.body);
    return Response.json({
      success: true,
      candles: Object.fromEntries(body.symbols.map((s) => [s, f.setupBars()])),
    });
  };
  await assert.rejects(
    () =>
      feed.fetchScannerData(
        members.map((m) => m.symbol),
        controller.signal,
        () => controller.abort(),
        { ...runtime, fetcher }
      ),
    /abort/i
  );
  assert.equal(count, 1);
  count = 0;
  await assert.rejects(
    () =>
      feed.fetchScannerData(
        ['SBIN', 'TCS'],
        freshController().signal,
        () => {},
        {
          ...runtime,
          fetcher: async () => {
            count++;
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          },
        }
      ),
    /Sign in/
  );
  assert.equal(count, 1);
});
test('official source loader falls back only to the other official source, caches today, and never serves yesterday on failure', async (t) => {
  const oldFetch = global.fetch,
    OldDate = Date;
  let clock = new OldDate('2026-11-21T08:00:00+05:30').getTime(),
    calls = 0,
    fail = false;
  global.Date = class extends OldDate {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
    }
    static now() {
      return clock;
    }
  };
  t.after(() => {
    global.fetch = oldFetch;
    global.Date = OldDate;
  });
  global.fetch = async (url) => {
    calls++;
    if (fail || url === universeModule.NIFTY50_SOURCE)
      return new Response('unavailable', { status: 503 });
    return new Response(f.csv);
  };
  const u = await universeModule.getNifty50Universe();
  assert.equal(u.members.length, 50);
  assert.match(u.source, /archives\.nseindia/);
  assert.equal(calls, 2);
  await universeModule.getNifty50Universe();
  assert.equal(calls, 2);
  clock += 86400000;
  fail = true;
  await assert.rejects(() => universeModule.getNifty50Universe());
  assert.equal(calls, 4);
});

test('scanner quote batches survive the real API token deduplication and resolve all 50 current instruments', async (t) => {
  const angel = require('../lib/angel.ts'),
    master = require('../lib/cashInstruments.ts'),
    route = require('../app/api/market/quote/route.ts');
  const oldMaster = master.getCashInstruments,
    oldQuote = angel.getAngelMarketData;
  t.after(() => {
    master.getCashInstruments = oldMaster;
    angel.getAngelMarketData = oldQuote;
  });
  const instruments = Object.fromEntries(
    members.map((m, i) => [
      m.symbol,
      {
        symbol: m.symbol,
        tradingSymbol: m.symbol + '-EQ',
        exchange: 'NSE',
        token: String(1000 + i),
        tickSize: 0.01,
        asOf: '2026-11-20',
      },
    ])
  );
  master.getCashInstruments = async () => instruments;
  let providerCount = 0;
  angel.getAngelMarketData = async (tokens) => {
    assert.ok(tokens.NSE.length <= 15);
    providerCount += tokens.NSE.length;
    return {
      data: {
        fetched: tokens.NSE.map((token) => ({
          symbolToken: token,
          ltp: 202.21,
          exchFeedTime: '20-Nov-2026 09:45:05',
          depth: {
            buy: [{ price: 202.2, quantity: 100 }],
            sell: [{ price: 202.21, quantity: 100 }],
          },
        })),
        unfetched: [],
      },
    };
  };
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    return url.endsWith('/quote')
      ? route.POST({ json: async () => body })
      : Response.json({
          success: true,
          candles: Object.fromEntries(
            body.symbols.map((s) => [s, f.setupBars()])
          ),
          errors: [],
        });
  };
  const data = await feed.fetchScannerData(
    members.map((m) => m.symbol),
    freshController().signal,
    () => {},
    { ...runtime, fetcher }
  );
  assert.equal(providerCount, 50);
  assert.equal(Object.keys(data.quotes).length, 50);
  assert.deepEqual(data.errors, {});
  assert.equal(data.quotes.ETERNAL.tickSize, 0.01);
});
