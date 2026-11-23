require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://scanner.example.test',
});
for (const key of [
  'window',
  'self',
  'document',
  'navigator',
  'localStorage',
  'HTMLElement',
  'Event',
])
  Object.defineProperty(global, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
let hidden = false;
Object.defineProperty(document, 'hidden', {
  get: () => hidden,
  configurable: true,
});
const OriginalDate = Date,
  f = require('./scanner-fixtures.cjs');
let currentTime = f.now.getTime();
global.Date = class extends OriginalDate {
  constructor(...args) {
    super(...(args.length ? args : [currentTime]));
  }
  static now() {
    return currentTime;
  }
};
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client'),
  { Simulate } = require('react-dom/test-utils');
const feeds = require('../lib/scannerFeed.ts'),
  universeModule = require('../lib/nifty50.ts');
const members = universeModule.parseNifty50CSV(f.csv);
const universe = {
  members,
  source: universeModule.NIFTY50_SOURCE,
  asOf: '2026-11-20',
  checkedAt: f.now.toISOString(),
};
const Page = require('../app/market/page.tsx').default;
const sample = () => ({
  quotes: { SBIN: f.quote },
  candles: { SBIN: f.setupBars(), NIFTY: f.setupBars() },
  errors: {},
  completedAt: new Date().toISOString(),
});
const button = (node, text) =>
  [...node.querySelectorAll('button')].find((b) => b.textContent === text);
async function mount(t) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const originalLoad = feeds.loadScannerUniverse,
    originalData = feeds.fetchScannerData;
  feeds.loadScannerUniverse = async () => universe;
  feeds.fetchScannerData = async () => sample();
  t.after(async () => {
    await act(async () => root.unmount());
    el.remove();
    feeds.loadScannerUniverse = originalLoad;
    feeds.fetchScannerData = originalData;
    localStorage.clear();
    hidden = false;
    currentTime = f.now.getTime();
  });
  await act(async () => root.render(React.createElement(Page)));
  return el;
}
async function change(el, label, value) {
  const input = [...el.querySelectorAll('label')]
    .find((l) => l.textContent === label)
    ?.querySelector('input');
  assert.ok(input, label);
  await act(async () => Simulate.change(input, { target: { value } }));
}

test('scanner explains costs, scans all official members and leaves the saved study and watchlist untouched', async (t) => {
  localStorage.setItem(
    'paper_trading_book_v1',
    JSON.stringify({
      version: 1,
      positions: [],
      observations: [],
      research: { symbols: ['RELIANCE', 'TCS', 'HDFCBANK'] },
    })
  );
  localStorage.setItem('watchlist', '["RELIANCE","TCS","HDFCBANK"]');
  const before = {
    book: localStorage.getItem('paper_trading_book_v1'),
    watch: localStorage.getItem('watchlist'),
  };
  const el = await mount(t);
  let requested = [];
  feeds.fetchScannerData = async (symbols) => {
    requested = symbols;
    return sample();
  };
  assert.match(el.textContent, /Your three-share study stays separate/);
  assert.match(el.textContent, /₹22.50/);
  await act(async () => button(el, 'Scan Nifty 50').click());
  assert.equal(requested.length, 50);
  assert.match(el.textContent, /SBIN · fits estimated budget/);
  assert.match(el.textContent, /Quantity 4/);
  assert.match(el.textContent, /not a trade approval/);
  assert.equal(localStorage.getItem('paper_trading_book_v1'), before.book);
  assert.equal(localStorage.getItem('watchlist'), before.watch);
  assert.ok(
    ![...el.querySelectorAll('button')].some((b) =>
      /Record.*entry|Buy|Add to watchlist/.test(b.textContent)
    )
  );
  await change(el, 'Extra round-trip charges (₹)', '5');
  assert.match(el.textContent, /Run a scan to evaluate/);
});
test('scanner removes shortlist eligibility as quotes age and preserves a no-candidate result', async (t) => {
  const oldInterval = window.setInterval;
  let tick;
  window.setInterval = (fn, ms) => {
    if (ms === 5000) tick = fn;
    return 123;
  };
  t.after(() => (window.setInterval = oldInterval));
  const el = await mount(t);
  await act(async () => button(el, 'Scan Nifty 50').click());
  assert.match(el.textContent, /Shortlist · 1/);
  currentTime += 31000;
  await act(async () => tick());
  assert.match(el.textContent, /Shortlist · 0/);
  assert.match(el.textContent, /Quote is stale/);
});
test('active scanner UI cannot lower execution or rounding costs to manufacture a shortlist', async (t) => {
  const el = await mount(t);
  await change(el, 'Execution reserve floor (₹, min 5)', '4.99');
  assert.equal(button(el, 'Scan Nifty 50').disabled, true);
  assert.match(el.textContent, /at least ₹5 execution reserve/);
  await change(el, 'Execution reserve floor (₹, min 5)', '5');
  await change(el, 'Tax-rounding reserve (₹, min 1)', '0.99');
  assert.equal(button(el, 'Scan Nifty 50').disabled, true);
  await change(el, 'Tax-rounding reserve (₹, min 1)', '1');
  assert.equal(button(el, 'Scan Nifty 50').disabled, false);
});
test('scanner cancels a hidden-tab run and blocks duplicate starts', async (t) => {
  const el = await mount(t);
  let calls = 0;
  feeds.fetchScannerData = async (_symbols, signal) => {
    calls++;
    return new Promise((_resolve, reject) =>
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('Cancelled', 'AbortError')),
        { once: true }
      )
    );
  };
  await act(async () => {
    button(el, 'Scan Nifty 50').click();
  });
  assert.equal(calls, 1);
  assert.equal(button(el, 'Scanning…').disabled, true);
  await act(async () => {
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.match(el.textContent, /cancelled or paused/);
  assert.equal(calls, 1);
  assert.match(el.textContent, /Shortlist · 0/);
});
test('scanner explains a cross-tab wait and cancellation preserves both journals without a feed request', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  const locks = require('./lock-fixture.cjs').lockFixture();
  Object.defineProperty(navigator, 'locks', {
    value: locks,
    configurable: true,
  });
  t.after(() =>
    descriptor
      ? Object.defineProperty(navigator, 'locks', descriptor)
      : delete navigator.locks
  );
  const el = await mount(t);
  const before = JSON.stringify({ ...localStorage });
  let finish,
    requests = 0;
  const held = locks.request(
    require('../lib/candleFeedLock.ts').CANDLE_FEED_LOCK,
    () => new Promise((resolve) => (finish = resolve))
  );
  await act(async () => new Promise((resolve) => setImmediate(resolve)));
  feeds.fetchScannerData = async () => {
    requests++;
    return sample();
  };
  await act(async () => button(el, 'Scan Nifty 50').click());
  assert.match(el.textContent, /Waiting for another tracker tab/);
  assert.equal(requests, 0);
  await act(async () => button(el, 'Cancel scan').click());
  assert.match(el.textContent, /cancelled or paused/);
  await act(async () => {
    finish();
    await held;
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.equal(requests, 0);
  assert.equal(JSON.stringify({ ...localStorage }), before);
});
test('off-hours feed checks never produce a tradable shortlist', async (t) => {
  currentTime = new OriginalDate('2026-11-21T10:00:00+05:30').getTime();
  const el = await mount(t);
  feeds.loadScannerUniverse = async () => ({
    ...universe,
    asOf: '2026-11-21',
    checkedAt: new Date().toISOString(),
  });
  await act(async () => button(el, 'Check Nifty 50 feeds').click());
  assert.match(
    el.textContent,
    /Outside the entry window. This is a feed check only/
  );
  assert.match(el.textContent, /Shortlist · 0/);
  assert.equal(button(el, 'Recheck SBIN').disabled, false);
});

test('failed rechecks retain context, block old eligibility, recover on retry and never write journals', async (t) => {
  const el = await mount(t);
  await act(async () => button(el, 'Scan Nifty 50').click());
  assert.match(el.textContent, /Shortlist · 1/);
  // Compare every saved key, including both books and the study configuration.
  const before = JSON.stringify({ ...localStorage });
  let reject;
  feeds.loadScannerUniverse = () =>
    new Promise((_resolve, fail) => (reject = fail));
  await act(async () => button(el, 'Recheck SBIN').click());
  assert.match(el.textContent, /All 50 results/);
  assert.match(el.textContent, /Shortlist · 0/);
  await act(async () => reject(new TypeError('Failed to fetch')));
  assert.match(el.textContent, /SBIN recheck failed/);
  assert.match(el.textContent, /Previous results remain for reference/);
  assert.match(el.textContent, /Shortlist · 0/);
  assert.match(el.textContent, /index confirmation must be refreshed/);
  assert.equal(button(el, 'Recheck SBIN').disabled, false);
  feeds.loadScannerUniverse = async () => universe;
  await act(async () => button(el, 'Recheck SBIN').click());
  assert.match(el.textContent, /Shortlist · 1/);
  assert.doesNotMatch(el.textContent, /SBIN recheck failed/);
  assert.equal(JSON.stringify({ ...localStorage }), before);
});
