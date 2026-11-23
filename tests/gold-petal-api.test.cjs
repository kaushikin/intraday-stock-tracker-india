require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const f = require('./gold-petal-fixtures.cjs');
test('paper data route rejects client tokens and orders and leaves journal mutations unsupported', async (t) => {
  const server = require('../lib/goldPetalServer.ts'),
    original = server.loadPetalFeed;
  t.after(() => (server.loadPetalFeed = original));
  let calls = 0;
  server.loadPetalFeed = async (signal, symbol) => {
    calls++;
    assert.ok(signal instanceof AbortSignal);
    assert.equal(symbol, f.contract.symbol);
    return f.feed();
  };
  const { POST } = require('../app/api/market/gold-petal/route.ts');
  for (const body of [
    { token: '123' },
    { action: 'BUY' },
    { contract: 'GOLD04DEC26FUT' },
    null,
    [],
  ]) {
    const r = await POST(
      new Request('http://localhost/api/market/gold-petal', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    );
    assert.equal(r.status, 400);
  }
  assert.equal(calls, 0);
  const r = await POST(
    new Request('http://localhost/api/market/gold-petal', {
      method: 'POST',
      body: JSON.stringify({ contract: f.contract.symbol }),
    })
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.equal(calls, 1);
});
test('Gold Petal server uses MCX candles then exact-contract depth through existing Angel readers and exposes partial failure safely', async (t) => {
  const angel = require('../lib/angel.ts'),
    server = require('../lib/goldPetalServer.ts'),
    originalFetch = global.fetch,
    oldCandles = angel.getAngelCandleData,
    oldQuotes = angel.getAngelMarketData;
  t.after(() => {
    global.fetch = originalFetch;
    angel.getAngelCandleData = oldCandles;
    angel.getAngelMarketData = oldQuotes;
  });
  global.fetch = async () => ({
    ok: true,
    json: async () => [
      {
        name: 'GOLDPETAL',
        symbol: f.contract.symbol,
        token: f.contract.token,
        expiry: '31DEC2026',
        lotsize: '1',
        tick_size: '100',
        instrumenttype: 'FUTCOM',
        exch_seg: 'MCX',
      },
    ],
  });
  const order = [];
  angel.getAngelCandleData = async (req, signal) => {
    order.push('candles');
    assert.equal(req.exchange, 'MCX');
    assert.equal(req.symboltoken, f.contract.token);
    assert.equal(req.interval, 'FIVE_MINUTE');
    assert.ok(req.fromdate.endsWith('09:00'));
    throw new Error('secret provider token');
  };
  angel.getAngelMarketData = async (tokens) => {
    order.push('quotes');
    assert.deepEqual(tokens, { MCX: [f.contract.token] });
    return {
      data: {
        fetched: [
          {
            symbolToken: f.contract.token,
            tradingSymbol: f.contract.symbol,
            exchange: 'MCX',
            ltp: 12560,
            depth: {
              buy: [{ price: 12559, quantity: 2 }],
              sell: [{ price: 12560, quantity: 2 }],
            },
            exchFeedTime: '23-Nov-2026 19:30:20',
            exchTradeTime: '23-Nov-2026 19:30:20',
          },
        ],
      },
    };
  };
  const data = await server.loadPetalFeed(
    new AbortController().signal,
    f.contract.symbol
  );
  assert.deepEqual(order, ['candles', 'quotes']);
  assert.equal(data.quote.bid, 12559);
  assert.deepEqual(data.candles, []);
  assert.ok(data.errors.length);
  assert.ok(!JSON.stringify(data).includes('secret provider token'));
});
