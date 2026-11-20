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
