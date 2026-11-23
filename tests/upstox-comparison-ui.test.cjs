require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', {
  url: 'https://comparison.example.test/market',
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
Object.defineProperty(document, 'hidden', { value: false, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client'),
  { Simulate } = require('react-dom/test-utils');
const feed = require('../lib/feedComparison.ts');
const Panel = require('../components/UpstoxComparisonPanel.tsx').default;
const RealDate = Date;
let time = Date.parse('2026-11-23T10:00:05+05:30');
global.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [time]));
  }
  static now() {
    return time;
  }
};
const bar = {
  time: '2026-11-23T09:55:00+05:30',
  open: 200,
  high: 202,
  low: 199,
  close: 201,
  volume: 100,
};
function sample(symbol = 'ONGC') {
  const provider = () => ({
    candles: { [symbol]: [bar], NIFTY: [bar] },
    quotes: {
      [symbol]: {
        price: 201,
        feedTime: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
      },
    },
    errors: {},
  });
  return {
    symbol,
    completedAt: new Date().toISOString(),
    angel: provider(),
    upstox: provider(),
  };
}
const button = (el, text) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent === text);
async function mount(t, configured) {
  const saved = { fetch: global.fetch, comparison: feed.fetchFeedComparison };
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push({ url, init });
    assert.equal(url, '/api/market/upstox-comparison');
    return Response.json({ success: true, configured });
  };
  localStorage.setItem(
    'paper_trading_book_v1',
    JSON.stringify({ research: { symbols: ['RELIANCE', 'TCS', 'HDFCBANK'] } })
  );
  localStorage.setItem(
    'scanner_paper_journal_v1',
    JSON.stringify(require('./fixtures/scanner-v1-closed.json'))
  );
  localStorage.setItem('trades', '[{"id":"old-trade-preserved"}]');
  localStorage.setItem('watchlist', '["RELIANCE","TCS","HDFCBANK"]');
  const before = JSON.stringify({ ...localStorage });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const render = (props) =>
    root.render(
      React.createElement(Panel, {
        selected: '',
        scanBusy: false,
        now: new Date(),
        ...props,
      })
    );
  t.after(async () => {
    await act(async () => root.unmount());
    el.remove();
    assert.equal(
      JSON.stringify({ ...localStorage }),
      before,
      'Comparison must preserve all journal and study bytes'
    );
    localStorage.clear();
    global.fetch = saved.fetch;
    feed.fetchFeedComparison = saved.comparison;
    Object.defineProperty(document, 'hidden', {
      value: false,
      configurable: true,
    });
    time = Date.parse('2026-11-23T10:00:05+05:30');
  });
  await act(async () => render());
  return { el, root, requests, render };
}
test('missing-token panel shows account and server-secret instructions, disables comparisons and never asks for a token', async (t) => {
  const { el, requests } = await mount(t, false);
  assert.match(el.textContent, /Not connected/);
  assert.match(el.textContent, /UPSTOX_ANALYTICS_TOKEN/);
  assert.match(el.textContent, /Upstox account registration/);
  assert.match(el.textContent, /Verification only/);
  assert.equal(button(el, 'Compare feeds').disabled, true);
  assert.equal(el.querySelectorAll('input').length, 1);
  assert.equal(el.querySelector('input').value, 'ONGC');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.body, undefined);
  await act(async () => button(el, 'Check token setup').click());
  assert.equal(requests.length, 2);
});
test('comparison displays mismatches, ages matching candles, clears on a new share and has no save/entry controls', async (t) => {
  const { el, render } = await mount(t, true);
  feed.fetchFeedComparison = async () => {
    const result = sample();
    result.upstox.candles.ONGC = [{ ...bar, close: 201.01 }];
    return result;
  };
  await act(async () => button(el, 'Compare feeds').click());
  assert.match(el.textContent, /ONGC · DIFFERENT/);
  assert.match(el.textContent, /NIFTY · MATCH/);
  assert.match(el.textContent, /Nothing here is saved/);
  assert.ok(
    ![...el.querySelectorAll('button')].some((b) =>
      /Save|Record|Buy|Sell/.test(b.textContent)
    )
  );
  assert.equal(
    button(el, 'Compare feeds').disabled,
    true,
    'Cooldown prevents repeated requests'
  );
  time += 6 * 60000;
  await act(async () => render());
  assert.match(el.textContent, /NIFTY · STALE/);
  await act(async () =>
    Simulate.change(el.querySelector('input'), { target: { value: 'SBIN' } })
  );
  assert.doesNotMatch(el.textContent, /ONGC · DIFFERENT|NIFTY · STALE/);
  await act(async () => render({ scanBusy: true }));
  assert.equal(button(el, 'Compare feeds').disabled, true);
});
test('failed or hidden-tab comparisons do not retain a previous match or write storage', async (t) => {
  const { el, render } = await mount(t, true);
  feed.fetchFeedComparison = async () => sample();
  await act(async () => button(el, 'Compare feeds').click());
  assert.match(el.textContent, /ONGC · MATCH/);
  time += 31000;
  await act(async () => render());
  feed.fetchFeedComparison = async () => {
    throw new Error('Fixture feed failure');
  };
  await act(async () => button(el, 'Compare feeds').click());
  assert.match(el.textContent, /Fixture feed failure/);
  assert.doesNotMatch(el.textContent, /ONGC · MATCH/);
  time += 31000;
  await act(async () => render());
  feed.fetchFeedComparison = async (_symbol, signal) =>
    new Promise((_resolve, reject) =>
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('Cancelled', 'AbortError')),
        { once: true }
      )
    );
  await act(async () => button(el, 'Compare feeds').click());
  assert.ok(button(el, 'Cancel comparison'));
  await act(async () => {
    Object.defineProperty(document, 'hidden', {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.match(el.textContent, /Comparison cancelled/);
  assert.doesNotMatch(el.textContent, /ONGC · MATCH/);
});
