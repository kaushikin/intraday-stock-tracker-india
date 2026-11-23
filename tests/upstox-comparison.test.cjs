require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const adapter = require('../lib/upstoxComparison.ts');
const route = require('../app/api/market/upstox-comparison/route.ts');
const universe = require('../lib/nifty50.ts');
const comparison = require('../lib/feedComparison.ts');
const OriginalDate = Date;
let time = Date.parse('2026-11-23T10:00:05+05:30');
global.Date = class extends OriginalDate {
  constructor(...args) {
    super(...(args.length ? args : [time]));
  }
  static now() {
    return time;
  }
};
const key = 'NSE_EQ|INE062A01020';
const row = ['2026-11-23T09:55:00+05:30', 200, 202, 199, 201, 100];
const bar = (stamp = row[0]) => ({
  time: stamp,
  open: 200,
  high: 202,
  low: 199,
  close: 201,
  volume: 100,
});
const request = (body) => ({
  json: async () => body,
  signal: new AbortController().signal,
});
function setup(t) {
  const saved = {
    fetch: global.fetch,
    token: process.env.UPSTOX_ANALYTICS_TOKEN,
    universe: universe.getNifty50Universe,
  };
  process.env.UPSTOX_ANALYTICS_TOKEN = 'fixture-secret-never-return';
  universe.getNifty50Universe = async () => ({
    asOf: '2026-11-23',
    members: [{ symbol: 'SBIN', isin: 'INE062A01020' }],
  });
  t.after(() => {
    global.fetch = saved.fetch;
    universe.getNifty50Universe = saved.universe;
    if (saved.token === undefined) delete process.env.UPSTOX_ANALYTICS_TOKEN;
    else process.env.UPSTOX_ANALYTICS_TOKEN = saved.token;
  });
}
test('missing-token status is private, contains no token and makes no provider call', async (t) => {
  setup(t);
  delete process.env.UPSTOX_ANALYTICS_TOKEN;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new Error('Unexpected call');
  };
  const status = await route.GET();
  assert.deepEqual(await status.json(), {
    success: true,
    configured: false,
    purpose: 'verification-only',
  });
  assert.match(status.headers.get('cache-control'), /no-store/);
  assert.equal(
    (await route.POST(request({ symbol: 'SBIN', kind: 'CANDLES' }))).status,
    503
  );
  assert.equal(calls, 0);
});
test('Upstox route maps current cash ISIN and NIFTY spot, uses only server-side GETs and removes incomplete bars', async (t) => {
  setup(t);
  const urls = [];
  global.fetch = async (url, init) => {
    urls.push(url);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(new URL(url).origin, 'https://api.upstox.com');
    assert.equal(
      init.headers.Authorization,
      'Bearer fixture-secret-never-return'
    );
    return Response.json({
      status: 'success',
      data: {
        candles: [
          row,
          ['2026-11-23T10:00:00+05:30', 200, 202, 199, 201, 10],
          ['2026-11-23T09:50:00+05:30', 200, 201, 199, 200, 90],
        ],
      },
    });
  };
  const result = await (
    await route.POST(request({ symbol: 'sbin', kind: 'CANDLES' }))
  ).json();
  assert.equal(result.purpose, 'verification-only');
  assert.equal(result.isin, 'INE062A01020');
  assert.deepEqual(
    urls.map((u) => decodeURIComponent(u).split('/intraday/')[1]),
    [`${key}/minutes/5`, 'NSE_INDEX|Nifty 50/minutes/5']
  );
  assert.equal(result.candles.SBIN.length, 2);
  assert.equal(result.candles.SBIN.at(-1).time, '2026-11-23T04:25:00.000Z');
  assert.equal(result.errors.length, 0);
  assert.ok(
    !JSON.stringify(result).includes(process.env.UPSTOX_ANALYTICS_TOKEN)
  );
  assert.equal(
    (await route.POST(request({ symbol: 'UNKNOWN', kind: 'CANDLES' }))).status,
    400
  );
  assert.equal(
    (
      await route.POST(
        request({ symbol: 'SBIN', kind: 'QUOTES', token: 'do-not-accept' })
      )
    ).status,
    400
  );
  assert.equal(urls.length, 2);
});
test('quotes verify instrument identity, preserve timestamps and never infer freshness from receipt alone', async (t) => {
  setup(t);
  global.fetch = async () =>
    Response.json({
      status: 'success',
      data: {
        one: {
          instrument_token: key,
          last_price: 201.5,
          timestamp: '2026-11-23T10:00:03+05:30',
          last_trade_time: '1795408202000',
          depth: { buy: [{ price: 201.4 }], sell: [{ price: 201.5 }] },
        },
        wrong: { instrument_token: 'NSE_INDEX|Nifty Bank', last_price: 50000 },
      },
    });
  const result = await (
    await route.POST(request({ symbol: 'SBIN', kind: 'QUOTES' }))
  ).json();
  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].symbol, 'SBIN');
  assert.equal(result.quotes[0].feedTime, '2026-11-23T04:30:03.000Z');
  assert.equal(result.errors[0].symbol, 'NIFTY');
  assert.equal(
    comparison.comparisonQuoteIssue(result.quotes[0], new Date()),
    'Recent provider snapshot'
  );
  assert.equal(
    comparison.comparisonQuoteIssue(
      { price: 201, receivedAt: new Date().toISOString() },
      new Date()
    ),
    'Provider timestamp unavailable'
  );
  assert.equal(adapter.upstoxTime('not-a-time'), undefined);
  assert.equal(adapter.upstoxTime(time), new Date().toISOString());
});
test('invalid token and malformed responses expose a safe error without returning provider secrets', async (t) => {
  setup(t);
  global.fetch = async () =>
    new Response(process.env.UPSTOX_ANALYTICS_TOKEN, { status: 401 });
  let result = await (
    await route.POST(request({ symbol: 'SBIN', kind: 'CANDLES' }))
  ).json();
  assert.ok(
    result.errors.every((e) => e.code === 'AUTH' && e.providerStatus === 401)
  );
  assert.ok(
    !JSON.stringify(result).includes(process.env.UPSTOX_ANALYTICS_TOKEN)
  );
  global.fetch = async () =>
    new Response(process.env.UPSTOX_ANALYTICS_TOKEN, { status: 200 });
  result = await (
    await route.POST(request({ symbol: 'SBIN', kind: 'QUOTES' }))
  ).json();
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every((e) => e.code === 'FORMAT'));
  assert.ok(
    !JSON.stringify(result).includes(process.env.UPSTOX_ANALYTICS_TOKEN)
  );
});
test('candle matching refuses stale, misaligned and missing values and displays price and volume differences', () => {
  const a = [bar()],
    b = [bar()];
  assert.equal(
    comparison.compareLatestCandles(a, b, new Date()).status,
    'MATCH'
  );
  assert.equal(
    comparison.compareLatestCandles(
      a,
      [{ ...bar(), close: 201.01 }],
      new Date()
    ).status,
    'DIFFERENT'
  );
  assert.equal(
    comparison.compareLatestCandles(a, [{ ...bar(), volume: 101 }], new Date())
      .status,
    'DIFFERENT'
  );
  assert.equal(
    comparison.compareLatestCandles(
      a,
      [{ ...bar(), volume: 0 }],
      new Date(),
      true
    ).status,
    'MATCH'
  );
  assert.equal(
    comparison.compareLatestCandles(a, [], new Date()).status,
    'UNAVAILABLE'
  );
  assert.equal(
    comparison.compareLatestCandles(
      a,
      [bar('2026-11-23T09:50:00+05:30')],
      new Date()
    ).status,
    'NOT_ALIGNED'
  );
  assert.equal(
    comparison.compareLatestCandles(a, b, new Date('2026-11-23T10:06:00+05:30'))
      .status,
    'STALE'
  );
  assert.equal(
    comparison.compareLatestCandles(
      [bar('2026-11-23T10:00:00+05:30')],
      b,
      new Date()
    ).status,
    'UNAVAILABLE'
  );
  assert.equal(
    comparison.compareLatestCandles(a, b, new Date('2026-11-23T17:00:00+05:30'))
      .status,
    'STALE'
  );
});
test('malformed and conflicting candle rows fail visibly instead of allowing an older bar to match', async (t) => {
  setup(t);
  for (const rows of [
    [row, [...row.slice(0, 5), null]],
    [row, [row[0], 200, 202, 199, 201.5, 100]],
  ]) {
    global.fetch = async () =>
      Response.json({ status: 'success', data: { candles: rows } });
    await assert.rejects(
      adapter.readUpstoxCandles(key, new AbortController().signal),
      /invalid|conflicting/
    );
  }
});
test('the new comparison API remains behind the private app login', async (t) => {
  const before = process.env.APP_AUTH_TOKEN;
  process.env.APP_AUTH_TOKEN = 'fixture-app-auth';
  t.after(() =>
    before === undefined
      ? delete process.env.APP_AUTH_TOKEN
      : (process.env.APP_AUTH_TOKEN = before)
  );
  const { NextRequest } = require('next/server'),
    { middleware } = require('../middleware.ts');
  const url = 'https://private.example.test/api/market/upstox-comparison';
  assert.equal(middleware(new NextRequest(url)).status, 401);
  assert.equal(
    middleware(
      new NextRequest(url, { headers: { cookie: 'app_auth=fixture-app-auth' } })
    ).headers.get('x-middleware-next'),
    '1'
  );
});
test('isolated comparison gets quotes after both candle feeds and never replaces failed Angel candles with Upstox', async () => {
  const requests = [],
    finished = [];
  const fetcher = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, body });
    if (!body) return Response.json({ success: true, configured: true });
    const candles = body.kind === 'CANDLES' || url.endsWith('/candles');
    if (candles) {
      finished.push(url);
      return Response.json({
        success: true,
        candles: url.endsWith('/candles')
          ? {}
          : { SBIN: [bar()], NIFTY: [bar()] },
        errors: url.endsWith('/candles')
          ? [
              { symbol: 'SBIN', error: 'Angel rate limit' },
              { symbol: 'NIFTY', error: 'Angel rate limit' },
            ]
          : [],
      });
    }
    assert.equal(finished.length, 2);
    return Response.json({
      success: true,
      quotes: ['SBIN', 'NIFTY'].map((symbol) => ({
        symbol,
        price: 201,
        exchangeTime: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        feedTime: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
      })),
      errors: [],
    });
  };
  const result = await comparison.fetchFeedComparison(
    'SBIN',
    new AbortController().signal,
    fetcher
  );
  assert.equal(requests.length, 5);
  assert.equal(result.angel.candles.SBIN.length, 0);
  assert.equal(result.upstox.candles.SBIN.length, 1);
  assert.equal(
    comparison.compareLatestCandles(
      result.angel.candles.SBIN,
      result.upstox.candles.SBIN,
      new Date()
    ).status,
    'UNAVAILABLE'
  );
  assert.ok(result.angel.errors.SBIN.includes('Angel rate limit'));
  let calls = 0;
  await assert.rejects(
    comparison.fetchFeedComparison(
      'SBIN',
      new AbortController().signal,
      async () => {
        calls++;
        return Response.json({ success: true, configured: false });
      }
    ),
    /not connected/
  );
  assert.equal(calls, 1);
});
test('comparison cancellation stops before quote requests', async () => {
  const controller = new AbortController();
  let quoteRequests = 0;
  await assert.rejects(
    comparison.fetchFeedComparison(
      'SBIN',
      controller.signal,
      async (url, init) => {
        if (init.method === 'GET')
          return Response.json({ success: true, configured: true });
        if (url.endsWith('/quote')) quoteRequests++;
        controller.abort();
        throw new DOMException('Cancelled', 'AbortError');
      }
    ),
    /abort|cancel/i
  );
  assert.equal(quoteRequests, 0);
});
test('provider throttling is not repeatedly retried', async (t) => {
  setup(t);
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response('slow down', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  };
  const result = await (
    await route.POST(request({ symbol: 'SBIN', kind: 'CANDLES' }))
  ).json();
  assert.equal(calls, 1);
  assert.ok(result.errors.every((e) => e.code === 'RATE_LIMIT'));
});
