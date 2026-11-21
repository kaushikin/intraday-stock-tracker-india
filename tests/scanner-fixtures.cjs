const fs = require('node:fs'),
  path = require('node:path');
const f = require('./readiness-fixtures.cjs');
const csv = fs.readFileSync(
  path.join(__dirname, 'fixtures/nifty50-2026-11-21.csv'),
  'utf8'
);
function setupBars() {
  const bars = [];
  for (const day of ['16', '17', '18', '19'])
    for (let i = 0; i < 75; i++)
      bars.push(
        f.bar(
          Date.parse(`2026-11-${day}T09:15:00+05:30`) + i * 300000,
          180 + bars.length * 0.05
        )
      );
  for (let i = 0; i < 5; i++)
    bars.push(
      f.bar(Date.parse('2026-11-20T09:15:00+05:30') + i * 300000, 200 + i * 0.2)
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
const quote = { ...f.quote, price: 202.21, ask: 202.21, bid: 202.2 };
module.exports = { ...f, csv, setupBars, quote };
