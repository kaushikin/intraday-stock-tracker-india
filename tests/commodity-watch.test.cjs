require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  parseCommodityMaster,
  commodityObservations,
  commodityQuoteStatus,
} = require('../lib/commodityWatch.ts');
const today = '2026-11-23';
function row(name, expiry, token) {
  return {
    name,
    expiry,
    token,
    symbol: name + expiry.slice(0, 5) + expiry.slice(-2) + 'FUT',
    exch_seg: 'MCX',
    instrumenttype: 'FUTCOM',
    lotsize: '1',
  };
}
const rows = [
  row('CRUDEOIL', '18DEC2026', '100'),
  row('COPPER', '30NOV2026', '200'),
  row('GOLD', '04DEC2026', '300'),
];
const contracts = parseCommodityMaster(rows, today);
const stamp = '2026-11-23T13:15:00Z';
const quote = (c) => ({
  symbolToken: c.token,
  tradingSymbol: c.tradingSymbol,
  exchange: 'MCX',
  ltp: 100,
  percentChange: 0,
  exchFeedTime: '23-Nov-2026 18:45:00',
  exchTradeTime: '23-Nov-2026 18:45:00',
});
test('current standard futures are selected by expiry, ignoring options, mini variants and expired/expiry-day contracts', () => {
  const input = [
    row('CRUDEOIL', '19JAN2027', '101'),
    row('GOLD', '05JUN2026', 'old'),
    row('COPPER', '23NOV2026', '201'),
    row('GOLDM', '04DEC2026', '301'),
    ...rows,
    { ...row('GOLD', '25NOV2026', '302'), instrumenttype: 'OPTFUT' },
    { ...row('COPPER', '25NOV2026', '202'), exch_seg: 'NSE' },
    row('GOLD', '31NOV2026', '303'),
  ];
  assert.deepEqual(parseCommodityMaster(input, today), contracts);
  assert.equal(
    parseCommodityMaster(rows, '2026-11-30').some((c) => c.symbol === 'COPPER'),
    false
  );
  assert.equal(
    parseCommodityMaster([row('GOLD', '05JUN2026', '123')], today).length,
    0
  );
});
test('ambiguous tokens and a contract symbol that disagrees with its expiry cannot silently resolve', () => {
  assert.throws(
    () =>
      parseCommodityMaster([...rows, row('GOLD', '04DEC2026', '999')], today),
    /Conflicting/
  );
  assert.deepEqual(
    parseCommodityMaster([{ ...rows[0], symbol: 'CRUDEOIL18JUN26FUT' }], today),
    []
  );
  assert.throws(() => parseCommodityMaster({}, today), /unreadable/);
});
test('quotes must match exchange, token and exact futures contract; partial failures stay explicit', () => {
  const result = commodityObservations(
    {
      data: {
        fetched: [
          quote(contracts[0]),
          { ...quote(contracts[1]), tradingSymbol: 'COPPER31DEC26FUT' },
        ],
      },
    },
    contracts,
    stamp
  );
  assert.equal(result[0].price, 100);
  assert.equal(result[0].changePercent, 0);
  assert.ok(result[1].error);
  assert.equal(result[1].price, undefined);
  assert.ok(result[2].error);
  assert.equal(
    commodityObservations(
      { data: { fetched: [quote(contracts[0]), quote(contracts[0])] } },
      contracts,
      stamp
    )[0].price,
    undefined
  );
  assert.equal(
    commodityObservations(
      { data: { fetched: [{ ...quote(contracts[0]), exchange: 'NSE' }] } },
      contracts,
      stamp
    )[0].price,
    undefined
  );
});
test('freshness uses exchange, last-trade and receipt times; stale prices never look live after waiting', () => {
  const item = commodityObservations(
    { data: { fetched: [quote(contracts[0])] } },
    contracts,
    stamp
  )[0];
  const now = Date.parse(stamp);
  assert.match(commodityQuoteStatus(item, now), /Recent/);
  assert.match(commodityQuoteStatus(item, now + 31000), /Stale/);
  assert.match(
    commodityQuoteStatus({ ...item, tradeTime: undefined }, now),
    /missing/
  );
  assert.match(
    commodityQuoteStatus(
      { ...item, tradeTime: new Date(now - 60000).toISOString() },
      now
    ),
    /Stale/
  );
  assert.match(
    commodityQuoteStatus(
      { ...item, exchangeTime: new Date(now + 6000).toISOString() },
      now
    ),
    /mismatch/
  );
});
test('watch endpoint requests only the three server-selected MCX contracts in one read', async (t) => {
  const instruments = require('../lib/commodityInstruments.ts'),
    angel = require('../lib/angel.ts');
  const oldList = instruments.getCommodityContracts,
    oldRead = angel.getAngelMarketData;
  t.after(() => {
    instruments.getCommodityContracts = oldList;
    angel.getAngelMarketData = oldRead;
  });
  instruments.getCommodityContracts = async () => contracts;
  let calls = 0;
  angel.getAngelMarketData = async (tokens, signal) => {
    calls++;
    assert.deepEqual(tokens, { MCX: ['100', '200', '300'] });
    assert.ok(signal instanceof AbortSignal);
    return { data: { fetched: contracts.map(quote) } };
  };
  const route = require('../app/api/market/commodities/route.ts');
  const result = await route.POST(
    new Request('http://localhost/api/market/commodities', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'OTHER', token: '999', action: 'BUY' }),
    })
  );
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.purpose, 'watch-only');
  assert.equal(calls, 1);
  assert.equal(data.observations.length, 3);
  assert.ok(result.headers.get('cache-control').includes('no-store'));
});
test('shared warmup and provider failures clear prices and return safe errors, never stale fallbacks', async (t) => {
  const instruments = require('../lib/commodityInstruments.ts'),
    angel = require('../lib/angel.ts');
  const { AngelRequestError } = require('../lib/angelErrors.ts');
  const oldList = instruments.getCommodityContracts,
    oldRead = angel.getAngelMarketData;
  t.after(() => {
    instruments.getCommodityContracts = oldList;
    angel.getAngelMarketData = oldRead;
  });
  instruments.getCommodityContracts = async () => contracts;
  const route = require('../app/api/market/commodities/route.ts');
  for (const failure of [
    new AngelRequestError(
      'TRACKING_WARMUP',
      429,
      false,
      'Shared tracking warming',
      60000
    ),
    new Error('secret-token'),
  ]) {
    angel.getAngelMarketData = async () => {
      throw failure;
    };
    const result = await route.POST(
      new Request('http://localhost/api/market/commodities', { method: 'POST' })
    );
    const data = await result.json();
    assert.equal(data.success, false);
    assert.ok(data.observations.every((o) => o.price === undefined));
    assert.ok(!JSON.stringify(data).includes('secret-token'));
    if (failure.kind) {
      assert.equal(result.status, 429);
      assert.equal(result.headers.get('retry-after'), '60');
      assert.ok(data.observations.every((o) => o.contract));
    }
  }
});
