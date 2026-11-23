require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const angel = require('../lib/angel.ts');
const master = require('../lib/cashInstruments.ts');
const hf = require('../app/api/hf/sentiment/route.ts');
const quotes = require('../app/api/market/quote/route.ts');
const candles = require('../app/api/market/candles/route.ts');
const request = (body) => ({ json: async () => body });
const instrument = {
  symbol: 'SBIN',
  exchange: 'NSE',
  token: '3045',
  tickSize: 0.01,
  asOf: '2026-11-20',
};

test('FinBERT passes only supplied headline and distinguishes classification from unavailable service', async (t) => {
  const previousFetch = global.fetch,
    previousToken = process.env.HUGGINGFACE_API_KEY;
  t.after(() => {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.HUGGINGFACE_API_KEY;
    else process.env.HUGGINGFACE_API_KEY = previousToken;
  });
  delete process.env.HUGGINGFACE_API_KEY;
  assert.equal(
    (await hf.POST(request({ text: 'Company reports earnings.' }))).status,
    503
  );
  process.env.HUGGINGFACE_API_KEY = 'test-fixture-only';
  global.fetch = async (url, options) => {
    assert.match(url, /ProsusAI\/finbert$/);
    assert.deepEqual(JSON.parse(options.body), {
      inputs: 'Company reports earnings.',
      parameters: { top_k: 3 },
    });
    return Response.json([
      { label: 'neutral', score: 0.8 },
      { label: 'positive', score: 0.15 },
      { label: 'negative', score: 0.05 },
    ]);
  };
  let result = await hf.POST(request({ text: 'Company reports earnings.' }));
  const data = await result.json();
  assert.equal(data.purpose, 'headline-sentiment-only');
  assert.deepEqual(data.result, { label: 'neutral', score: 0.8 });
  global.fetch = async () =>
    Response.json({ error: 'Service unavailable' }, { status: 503 });
  result = await hf.POST(request({ text: 'Company reports earnings.' }));
  assert.equal(result.status, 502);
  assert.equal((await result.json()).result, undefined);
  global.fetch = async () =>
    Response.json({ error: 'Payment Required' }, { status: 402 });
  result = await hf.POST(request({ text: 'Company reports earnings.' }));
  assert.equal(result.status, 502);
  const billing = await result.json();
  assert.equal(billing.providerStatus, 402);
  assert.match(billing.error, /billing|credit/i);
  global.fetch = async () => Response.json([{ label: 'positive', score: 4 }]);
  assert.equal(
    (await hf.POST(request({ text: 'Company reports earnings.' }))).status,
    502
  );
});

test('quote adapter uses current tokens and preserves exchange time separately from receipt time', async (t) => {
  const oldMaster = master.getCashInstruments,
    oldQuote = angel.getAngelMarketData;
  t.after(() => {
    master.getCashInstruments = oldMaster;
    angel.getAngelMarketData = oldQuote;
  });
  master.getCashInstruments = async () => ({ SBIN: instrument });
  angel.getAngelMarketData = async (tokens) => {
    assert.deepEqual(tokens, { NSE: ['3045'] });
    return {
      data: {
        fetched: [
          {
            symbolToken: '3045',
            tradingSymbol: 'SBIN-EQ',
            ltp: 200,
            exchFeedTime: '20-Nov-2026 09:45:05',
            depth: {
              buy: [{ price: 199.99, quantity: 100 }],
              sell: [{ price: 200, quantity: 200 }],
            },
          },
        ],
        unfetched: [],
      },
    };
  };
  const response = await quotes.POST(
    request({
      items: [{ symbol: 'SBIN', exchange: 'NSE', token: 'stale-client-token' }],
    })
  );
  const data = await response.json();
  assert.equal(data.quotes[0].exchangeTime, '2026-11-20T04:15:05.000Z');
  assert.equal(data.quotes[0].tickSize, 0.01);
  assert.equal(data.quotes[0].askQuantity, 200);
  assert.ok(Number.isFinite(Date.parse(data.quotes[0].lastUpdated)));
});

test('candle adapter excludes incomplete bars and never returns expired cached candles on provider failure', async (t) => {
  const oldMaster = master.getCashInstruments,
    oldCandles = angel.getAngelCandleData;
  t.after(() => {
    master.getCashInstruments = oldMaster;
    angel.getAngelCandleData = oldCandles;
    delete global.angelCandleCache;
  });
  master.getCashInstruments = async () => ({ SBIN: instrument });
  global.angelCandleCache = {};
  let fail = false;
  angel.getAngelCandleData = async () => {
    if (fail) throw new Error('Fixture provider timeout');
    return {
      data: [
        ['2026-11-19T09:15:00+05:30', 200, 201, 199, 200, 100],
        ['2027-01-04T09:15:00+05:30', 200, 999, 199, 200, 100],
      ],
    };
  };
  const body = { symbols: ['SBIN'], interval: 'FIVE_MINUTE' };
  const first = await (await candles.POST(request(body))).json();
  assert.equal(first.candles.SBIN.length, 1);
  for (const value of Object.values(global.angelCandleCache))
    value.expiresAt = 0;
  fail = true;
  const second = await (await candles.POST(request(body))).json();
  assert.deepEqual(second.candles.SBIN, []);
  assert.match(second.errors[0].error, /timeout/);
});

test('overlapping candle requests share one fetch and the cache cannot cross a new candle close', async (t) => {
  const oldMaster = master.getCashInstruments,
    oldCandles = angel.getAngelCandleData,
    OldDate = Date;
  let clock = new OldDate('2026-11-20T11:14:55+05:30').getTime();
  global.Date = class extends OldDate {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
    }
    static now() {
      return clock;
    }
  };
  t.after(() => {
    master.getCashInstruments = oldMaster;
    angel.getAngelCandleData = oldCandles;
    global.Date = OldDate;
    delete global.angelCandleCache;
  });
  master.getCashInstruments = async () => ({ SBIN: instrument });
  global.angelCandleCache = {};
  let calls = 0,
    release;
  const rows = [
    ['2026-11-20T11:05:00+05:30', 200, 201, 199, 200, 100],
    ['2026-11-20T11:10:00+05:30', 200, 202, 199, 201, 100],
  ];
  angel.getAngelCandleData = async () => {
    calls++;
    await new Promise((r) => (release = r));
    return { data: rows };
  };
  const body = { symbols: ['SBIN'], interval: 'FIVE_MINUTE' };
  const pending = [candles.POST(request(body)), candles.POST(request(body))];
  await new Promise(setImmediate);
  release();
  const results = await Promise.all(pending.map(async (r) => (await r).json()));
  assert.equal(calls, 1);
  assert.equal(results[0].candles.SBIN.length, 1);
  assert.deepEqual(results[0].candles, results[1].candles);
  assert.equal(
    Object.values(global.angelCandleCache)[0].expiresAt,
    new OldDate('2026-11-20T11:15:00+05:30').getTime()
  );
  clock += 6000;
  angel.getAngelCandleData = async () => {
    calls++;
    return { data: rows };
  };
  const fresh = await (await candles.POST(request(body))).json();
  assert.equal(calls, 2);
  assert.equal(fresh.candles.SBIN.length, 2);
});
