require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const m = require('../lib/goldPetalMarket.ts'),
  p = require('../lib/goldPetalPilot.ts'),
  f = require('./gold-petal-fixtures.cjs');
const open = () =>
  p.openPetal(f.book(), f.feed(), f.verification(), f.other, f.now);
const master = (expiry = '31DEC2026', token = '578631') => ({
  name: 'GOLDPETAL',
  symbol: 'GOLDPETAL' + expiry.slice(0, 5) + expiry.slice(-2) + 'FUT',
  token,
  expiry,
  exch_seg: 'MCX',
  instrumenttype: 'FUTCOM',
  lotsize: '1',
  tick_size: '100',
});
test('Gold Petal instrument identity requires one gram and a one-rupee tick; near expiry is excluded only for new entries', () => {
  const cs = m.petalContracts([
    master('30NOV2026', '574841'),
    master(),
    { ...master(), name: 'GOLDM' },
    { ...master('29JAN2027'), lotsize: '100' },
  ]);
  assert.equal(cs.length, 2);
  assert.equal(m.selectPetalContract(cs, f.now).symbol, f.contract.symbol);
  assert.equal(
    m.selectPetalContract(cs, f.now, 'GOLDPETAL30NOV26FUT').symbol,
    'GOLDPETAL30NOV26FUT'
  );
  assert.match(m.petalContractProblem(cs[0], f.now), /10 calendar/);
  assert.throws(
    () => m.petalContracts([master(), master('31DEC2026', '999')]),
    /Conflicting/
  );
  assert.throws(
    () => m.selectPetalContract(cs, f.now, 'GOLDPETAL29JAN27FUT'),
    /No supported/
  );
});
test('MCX evening calendar accepts the November 24 evening holiday and blocks full holidays, weekend, early/late entries and an unreviewed year', () => {
  assert.equal(m.petalSessionProblem(new Date('2026-11-24T14:00:00Z')), null);
  for (const date of [
    '2026-12-25T14:00:00Z',
    '2026-11-22T14:00:00Z',
    '2026-11-23T12:00:00Z',
    '2026-11-23T16:00:00Z',
    '2027-01-04T14:00:00Z',
  ])
    assert.ok(m.petalSessionProblem(new Date(date)));
});
test('MCX evening candles survive normalisation; forming, half-day morning and conflicting bars never qualify', () => {
  const raw = f
    .feed()
    .candles.map((b) => [b.time, b.open, b.high, b.low, b.close, b.volume]);
  assert.equal(m.parsePetalCandles(raw, f.now).length, 50);
  assert.equal(
    m.petalCandleProblem(m.parsePetalCandles(raw, f.now), f.now),
    null
  );
  const forming = ['2026-11-23T14:00:00Z', 1, 2, 1, 2, 1];
  assert.equal(m.parsePetalCandles([...raw, forming], f.now).length, 50);
  assert.throws(
    () => m.parsePetalCandles([...raw, [raw[0][0], 1, 2, 1, 2, 1]], f.now),
    /Conflicting/
  );
  assert.throws(
    () => m.parsePetalCandles([[raw[0][0], 100, 90, 80, 100, 1]], f.now),
    /Invalid/
  );
  assert.ok(
    m.petalCandleProblem(
      f.feed().candles.filter((_, i) => i !== 25),
      f.now
    )
  );
  const morning = [['2026-11-24T04:00:00Z', 100, 102, 99, 101, 10]];
  assert.deepEqual(
    m.parsePetalCandles(morning, new Date('2026-11-24T14:00:00Z')),
    []
  );
});
test('quotes match token, exact expiry and MCX; bid/ask and exchange/trade timestamps are required', () => {
  const q = {
    symbolToken: '578631',
    tradingSymbol: f.contract.symbol,
    exchange: 'MCX',
    ltp: 12560,
    depth: {
      buy: [{ price: 12559, quantity: 1 }],
      sell: [{ price: 12560, quantity: 1 }],
    },
    exchFeedTime: '23-Nov-2026 19:30:20',
    exchTradeTime: '23-Nov-2026 19:30:20',
  };
  const quote = m.parsePetalQuote(
    { data: { fetched: [q] } },
    f.contract,
    f.now.toISOString()
  );
  assert.equal(m.petalQuoteProblem(quote, f.now), null);
  for (const bad of [
    { ...q, exchange: 'NSE' },
    { ...q, symbolToken: '999' },
    { ...q, tradingSymbol: 'GOLDPETAL30NOV26FUT' },
    { ...q, depth: null },
    { ...q, exchTradeTime: '' },
  ])
    assert.throws(() =>
      m.parsePetalQuote(
        { data: { fetched: [bad] } },
        f.contract,
        f.now.toISOString()
      )
    );
  assert.ok(m.petalQuoteProblem(quote, new Date(f.now.getTime() + 31000)));
  assert.ok(
    m.petalQuoteProblem(
      { ...quote, tradeTime: new Date(f.now.getTime() + 6000).toISOString() },
      f.now
    )
  );
});
test('MCX fee calculation includes both normal orders, sell CTT, buy stamp, exchange/SEBI fees and taxable GST', () => {
  const c = p.petalCharges(12567, 12497);
  assert.equal(c.brokerage, 40);
  assert.equal(c.total, 49.36);
  assert.equal(c.ctt, 12497 * 0.0001);
  assert.equal(c.stamp, 12567 * 0.00002);
  assert.equal(c.gst, (40 + c.exchange + c.sebi) * 0.18);
  for (const bad of [0, -1, Infinity, NaN])
    assert.throws(() => p.petalCharges(bad, 12000));
});
test('paper plan funds full exposure, uses structural/ATR stop, both execution allowances, fees, reserve and a net 2R target', () => {
  const { plan, issues } = p.planPetal(f.feed(), f.now);
  assert.deepEqual(issues, []);
  assert.equal(plan.entry, 12565);
  assert.ok(plan.stop < 12544);
  assert.ok(plan.plannedRisk <= 150);
  assert.ok(plan.fullFunding > plan.entry);
  assert.ok(plan.fullFunding < 30000);
  assert.ok(plan.netReward >= 2 * plan.plannedRisk);
  assert.equal(plan.version, p.PETAL_VERSION);
  const high = p.planPetal(f.feed(), f.now, { stop: 130, target: 130 });
  assert.ok(high.issues.some((s) => s.includes('above ₹150')));
  const wide = f.feed();
  wide.candles.at(-1).low = 12300;
  assert.ok(
    p.planPetal(wide, f.now).issues.some((s) => s.includes('above ₹150'))
  );
  const flat = f.feed();
  flat.candles.at(-1).close = 12549;
  assert.ok(
    p.planPetal(flat, f.now).issues.some((s) => s.includes('breakout'))
  );
  const spread = f.feed();
  spread.quote.ask += 10;
  assert.ok(
    p.planPetal(spread, f.now).issues.some((s) => s.includes('spread'))
  );
});
test('a paper entry requires independent fresh verification and cannot reuse a prior expiry, bar or cheap fee assumption', () => {
  assert.equal(open().positions.length, 1);
  for (const update of [
    { contract: 'GOLDPETAL30NOV26FUT' },
    { barClose: 1 },
    { brokerPrice: 1 },
    { brokerTime: '2026-11-23T13:50:00Z' },
    { feeAtStop: 1 },
    { feeAtTarget: 1 },
    { eventChecked: false },
    { sessionConfirmed: false },
  ])
    assert.throws(() =>
      p.openPetal(
        f.book(),
        f.feed(),
        { ...f.verification(), ...update },
        f.other,
        f.now
      )
    );
  assert.throws(
    () =>
      p.openPetal(
        f.book(),
        f.feed(),
        f.verification(),
        f.other,
        new Date(f.now.getTime() + 31000)
      ),
    /stale/
  );
});
test('daily gates count loss without offsetting wins, reserve other open risk, and never permit more than one pilot entry or leverage', () => {
  const { plan } = p.planPetal(f.feed(), f.now, { stop: 55, target: 55 });
  const b = f.book();
  b.declarations['2026-11-23'].amount = 251 - plan.plannedRisk;
  assert.throws(
    () => p.openPetal(b, f.feed(), f.verification(), f.other, f.now),
    /remaining/
  );
  delete b.declarations['2026-11-23'];
  assert.throws(
    () => p.openPetal(b, f.feed(), f.verification(), f.other, f.now),
    /Declare/
  );
  assert.throws(
    () =>
      p.openPetal(
        f.book(),
        f.feed(),
        f.verification(),
        { loss: 0, openRisk: 10, openCount: 1 },
        f.now
      ),
    /existing/
  );
  assert.throws(
    () => p.openPetal(open(), f.feed(), f.verification(), f.other, f.now),
    /already|existing/
  );
  const risk = p.otherPaperRisk(
    [
      {
        entry: 100,
        exit: 90,
        quantity: 1,
        charges: 5,
        enteredAt: f.now.toISOString(),
        exitedAt: f.now.toISOString(),
        plannedRisk: 50,
      },
      {
        entry: 100,
        exit: 200,
        quantity: 1,
        charges: 5,
        enteredAt: f.now.toISOString(),
        exitedAt: f.now.toISOString(),
        plannedRisk: 50,
      },
      {
        entry: 100,
        quantity: 1,
        enteredAt: f.now.toISOString(),
        plannedRisk: 50,
      },
    ],
    f.now
  );
  assert.deepEqual(risk, { loss: 15, openRisk: 50, openCount: 1 });
});
test('exit alerts handle stops/gaps, target, time even without data, stale/mismatched quotes, and latch the first trigger', () => {
  const pos = open().positions[0],
    data = f.feed();
  data.quote.bid = pos.plan.stop - 100;
  data.quote.ask = data.quote.bid + 1;
  assert.equal(p.petalExitAlert(pos, data, 0, f.now).reason, 'STOP');
  assert.equal(
    p.petalExitAlert(pos, null, 0, new Date(f.now.getTime() + 30 * 60000))
      .reason,
    'TIME'
  );
  assert.equal(
    p.petalExitAlert(
      pos,
      { ...data, contract: { ...f.contract, symbol: 'GOLDPETAL30NOV26FUT' } },
      0,
      f.now
    ).reason,
    undefined
  );
  data.quote.bid = pos.plan.target;
  data.quote.ask = data.quote.bid + 1;
  assert.equal(p.petalExitAlert(pos, data, 0, f.now).reason, 'TARGET');
  assert.equal(
    p.petalExitAlert(
      { ...pos, alert: { reason: 'STOP', at: f.now.toISOString() } },
      data,
      0,
      f.now
    ).reason,
    'STOP'
  );
  assert.equal(
    p.petalExitAlert(pos, f.feed(), 250, f.now).reason,
    'DAILY_LIMIT'
  );
});
test('paper exit records losses beyond limits rather than capping them; fees cannot be reduced and data failures do not prevent manual exits', () => {
  const b = open(),
    pos = b.positions[0],
    price = pos.plan.stop - 200;
  assert.throws(
    () =>
      p.closePetal(
        b,
        pos.id,
        {
          price,
          charges: 1,
          reason: 'STOP',
          reference: 'broker',
          source: 'BROKER_MANUAL',
        },
        f.now
      ),
    /at least/
  );
  const closed = p.closePetal(
    b,
    pos.id,
    {
      price,
      charges: 60,
      reason: 'DATA_GAP',
      reference: 'broker screenshot observed timestamp',
      source: 'BROKER_MANUAL',
    },
    f.now
  );
  assert.ok(closed.positions[0].exit.net < -150);
  assert.equal(p.petalDailyLoss(closed, f.now), -closed.positions[0].exit.net);
  assert.deepEqual(p.parsePetalBook(JSON.stringify(closed)), closed);
  assert.throws(
    () => p.openPetal(closed, f.feed(), f.verification(), f.other, f.now),
    /one entry/
  );
  assert.throws(
    () =>
      p.parsePetalBook(
        JSON.stringify({ ...closed, kind: 'SCANNER_EXPLORATORY_PAPER' })
      ),
    /unreadable/
  );
  assert.throws(
    () =>
      p.parsePetalBook(JSON.stringify({ ...closed, positions: [pos, pos] })),
    /unreadable/
  );
});
