const now = new Date('2026-11-23T14:00:20Z');
const contract = {
  symbol: 'GOLDPETAL31DEC26FUT',
  token: '578631',
  expiry: '2026-12-31',
  lot: 1,
  tick: 1,
  exchange: 'MCX',
};
function feed() {
  const end = Date.parse('2026-11-23T13:55:00Z');
  const candles = Array.from({ length: 50 }, (_, i) => ({
    time: new Date(end - (49 - i) * 300000).toISOString(),
    open: 12499 + i,
    high: 12502 + i,
    low: 12497 + i,
    close: 12500 + i,
    volume: 100,
  }));
  candles[49] = { ...candles[49], high: 12561, close: 12560, volume: 200 };
  return {
    kind: 'GOLD_PETAL_PAPER',
    checkedAt: now.toISOString(),
    contract: { ...contract },
    candles,
    errors: [],
    quote: {
      price: 12560,
      bid: 12559,
      ask: 12560,
      bidQty: 5,
      askQty: 10,
      exchangeTime: now.toISOString(),
      tradeTime: now.toISOString(),
      receivedAt: now.toISOString(),
    },
  };
}
function verification(data = feed()) {
  return {
    contract: contract.symbol,
    barTime: data.candles.at(-1).time,
    barClose: data.candles.at(-1).close,
    brokerPrice: data.quote.price,
    brokerTime: now.toISOString(),
    feeAtStop: 55,
    feeAtTarget: 55,
    reference: 'Test fixture account tariff',
    sessionConfirmed: true,
    eventChecked: true,
  };
}
function book() {
  return {
    kind: 'GOLD_PETAL_PAPER',
    version: 1,
    positions: [],
    declarations: { '2026-11-23': { amount: 0, at: now.toISOString() } },
  };
}
module.exports = {
  now,
  contract,
  feed,
  verification,
  book,
  other: { loss: 0, openRisk: 0, openCount: 0 },
};
