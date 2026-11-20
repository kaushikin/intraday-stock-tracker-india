const now = new Date('2026-11-20T09:45:05+05:30');
const bar = (time, price = 200) => ({
  time: new Date(time).toISOString(),
  open: price,
  high: price + 1,
  low: price - 1,
  close: price,
  volume: 100,
});
function bars(price = 200) {
  const result = [];
  for (const day of ['16', '17', '18', '19', '20']) {
    const start = Date.parse(`2026-11-${day}T09:15:00+05:30`);
    for (let i = 0; i < (day === '20' ? 6 : 75); i++)
      result.push(bar(start + i * 300000, price));
  }
  return result;
}
const quote = {
  price: 200,
  change: 0,
  ask: 200,
  bid: 199.99,
  askQuantity: 100,
  tickSize: 0.01,
  instrumentAsOf: '2026-11-20',
  exchangeTime: now.toISOString(),
  lastUpdated: now.toISOString(),
};
function broker(snapshot) {
  return {
    ltp: snapshot.ltp,
    quoteTime: snapshot.exchangeTime,
    barTime: snapshot.stock.time,
    stock: { ...snapshot.stock },
    index: { ...snapshot.index },
  };
}
module.exports = { now, bar, bars, quote, broker };
