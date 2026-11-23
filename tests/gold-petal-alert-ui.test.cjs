require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { JSDOM } = require('jsdom');
const f = require('./gold-petal-fixtures.cjs'),
  webpush = require('web-push');
const dom = new JSDOM('<html><body></body></html>', {
  url: 'https://intraday-stock-tracker-india.vercel.app',
});
for (const k of [
  'window',
  'self',
  'document',
  'navigator',
  'localStorage',
  'HTMLElement',
  'Event',
])
  Object.defineProperty(global, k, {
    value: dom.window[k],
    configurable: true,
    writable: true,
  });
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [f.now.getTime()]));
  }
  static now() {
    return f.now.getTime();
  }
};
global.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'hidden', { value: false, configurable: true });
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client'),
  { Simulate } = require('react-dom/test-utils');
const Panel = require('../components/GoldPetalBackgroundAlerts.tsx').default;
const {
  invalidateChangedAlertRisk,
} = require('../lib/goldPetalAlertClient.ts');
const { PETAL_ALERT_LOCAL_KEY } = require('../lib/goldPetalAlerts.ts');
const button = (el, label) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent === label);
async function settled(el) {
  for (
    let i = 0;
    i < 100 && button(el, 'Enable today’s alerts + send test').disabled;
    i++
  )
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  assert.equal(
    button(el, 'Enable today’s alerts + send test').disabled,
    false,
    el.textContent,
  );
}
async function mount(t, permission = 'granted') {
  localStorage.clear();
  const records = {
    paper_trading_book_v1: JSON.stringify({
      version: 1,
      positions: [],
      observations: [],
    }),
    scanner_paper_journal_v1: JSON.stringify({
      version: 2,
      kind: 'SCANNER_EXPLORATORY_PAPER',
      positions: [],
      comparisons: [],
      feeChecks: [],
      observations: [],
    }),
    gold_petal_paper_pilot_v1: JSON.stringify(f.book()),
    watchlist: '["RELIANCE","TCS","HDFCBANK"]',
  };
  Object.entries(records).forEach(([k, v]) => localStorage.setItem(k, v));
  const writes = [],
    originalSet = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function (k, v) {
    writes.push(k);
    return originalSet.call(this, k, v);
  };
  const originalFetch = global.fetch,
    actions = [];
  const state = {
    publicKey: webpush.generateVAPIDKeys().publicKey,
    schedulerConnected: true,
    watch: null,
    heartbeat: { at: f.now.toISOString() },
  };
  global.fetch = async (url, options) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(options.body);
      actions.push(body);
      if (body.action === 'arm') {
        state.watch = {
          revision: 'test-revision',
          armedAt: f.now.toISOString(),
          expiresAt: '2026-11-23T16:00:00Z',
          confirmed: false,
          remaining: 250 - body.risk.used,
          feeFloor: body.risk.feeFloor,
        };
        return {
          ok: true,
          json: async () => ({
            revision: 'test-revision',
            expiresAt: state.watch.expiresAt,
          }),
        };
      }
      if (body.action === 'confirm')
        state.watch = { ...state.watch, confirmed: true };
      if (body.action === 'stop') state.watch = null;
    }
    return { ok: true, json: async () => ({ ...state }) };
  };
  const notification = { requestPermission: async () => permission };
  window.Notification = global.Notification = notification;
  window.PushManager = function () {};
  const subscription = {
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: {},
    }),
  };
  const registration = {
    pushManager: { getSubscription: async () => subscription },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: async () => registration,
      ready: Promise.resolve(registration),
    },
    configurable: true,
  });
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  t.after(async () => {
    await act(async () => root.unmount());
    el.remove();
    global.fetch = originalFetch;
    dom.window.Storage.prototype.setItem = originalSet;
    localStorage.clear();
  });
  await act(async () =>
    root.render(
      React.createElement(Panel, { feeFloor: { stop: 55, target: 55 } }),
    ),
  );
  return { el, records, writes, actions, state, root };
}
test('enable, confirm delivered test and invalidate changed risk leave both stock books, pilot and study intact', async (t) => {
  const { el, records, writes, actions, state } = await mount(t);
  assert.ok(button(el, 'Enable today’s alerts + send test').disabled);
  await act(async () =>
    Simulate.change(el.querySelector('input[type=checkbox]'), {
      target: { checked: true },
    }),
  );
  await act(async () =>
    button(el, 'Enable today’s alerts + send test').click(),
  );
  await settled(el);
  assert.equal(state.watch.confirmed, false);
  assert.match(el.textContent, /Waiting for you to confirm/);
  assert.equal(actions[0].risk.used, 0);
  assert.equal(actions[0].risk.equity, 30000);
  assert.ok(!Object.hasOwn(actions[0], 'positions'));
  await act(async () => button(el, 'I received the test notification').click());
  await settled(el);
  assert.equal(state.watch.confirmed, true);
  assert.ok(writes.every((k) => k === PETAL_ALERT_LOCAL_KEY));
  for (const [k, v] of Object.entries(records))
    assert.equal(localStorage.getItem(k), v, k);
  // Simulate another page's storage event without making any synthetic trade.
  localStorage.setItem(
    'paper_trading_book_v1',
    records.paper_trading_book_v1 + '\n',
  );
  await act(async () => invalidateChangedAlertRisk());
  assert.equal(state.watch, null);
  assert.equal(localStorage.getItem(PETAL_ALERT_LOCAL_KEY), null);
  assert.equal(
    localStorage.getItem('paper_trading_book_v1'),
    records.paper_trading_book_v1 + '\n',
  );
  assert.equal(
    localStorage.getItem('scanner_paper_journal_v1'),
    records.scanner_paper_journal_v1,
  );
  assert.equal(
    localStorage.getItem('gold_petal_paper_pilot_v1'),
    records.gold_petal_paper_pilot_v1,
  );
  assert.equal(localStorage.getItem('watchlist'), records.watchlist);
});
test('denied notification permission cannot arm a watch or write paper records', async (t) => {
  const { el, actions, writes } = await mount(t, 'denied');
  await act(async () =>
    Simulate.change(el.querySelector('input[type=checkbox]'), {
      target: { checked: true },
    }),
  );
  await act(async () =>
    button(el, 'Enable today’s alerts + send test').click(),
  );
  await settled(el);
  assert.match(el.textContent, /Notifications are blocked/);
  assert.deepEqual(actions, []);
  assert.deepEqual(writes, []);
});
test('higher entered costs stop a running background watch instead of leaving its earlier fee floor active', async (t) => {
  const { el, state, root, actions } = await mount(t);
  await act(async () =>
    Simulate.change(el.querySelector('input[type=checkbox]'), {
      target: { checked: true },
    }),
  );
  await act(async () =>
    button(el, 'Enable today’s alerts + send test').click(),
  );
  await settled(el);
  await act(async () =>
    root.render(
      React.createElement(Panel, { feeFloor: { stop: 151, target: 55 } }),
    ),
  );
  assert.equal(state.watch, null);
  assert.ok(
    actions.some((a) => a.action === 'stop' && a.revision === 'test-revision'),
  );
});
