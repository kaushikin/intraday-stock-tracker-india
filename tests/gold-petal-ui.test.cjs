require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://paper.example.test',
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
global.IS_REACT_ACT_ENVIRONMENT = true;
const RealDate = Date,
  f = require('./gold-petal-fixtures.cjs');
let clock = f.now.getTime();
global.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [clock]));
  }
  static now() {
    return clock;
  }
};
Object.defineProperty(document, 'hidden', { value: false, configurable: true });
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client'),
  { Simulate } = require('react-dom/test-utils');
const Page = require('../app/commodities/gold-petal/page.tsx').default,
  p = require('../lib/goldPetalPilot.ts');
let queue = Promise.resolve();
Object.defineProperty(navigator, 'locks', {
  value: { request: async (name, fn) => fn() },
  configurable: true,
});
const button = (el, s) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent === s);
async function change(el, label, value) {
  const wrapper = [...el.querySelectorAll('label')].find((l) =>
    l.textContent.startsWith(label)
  );
  assert.ok(wrapper, label);
  const input = wrapper.querySelector('input');
  await act(async () =>
    Simulate.change(input, {
      target: input.type === 'checkbox' ? { checked: value } : { value },
    })
  );
}
async function mount(t) {
  clock = f.now.getTime();
  localStorage.clear();
  const preserved = {
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
    watchlist: '["RELIANCE","TCS","HDFCBANK"]',
  };
  for (const [k, v] of Object.entries(preserved)) localStorage.setItem(k, v);
  const writes = [],
    orig = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function (k, v) {
    writes.push(k);
    return orig.call(this, k, v);
  };
  const originalFetch = global.fetch;
  global.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).includes('gold-petal')
        ? f.feed()
        : { success: false, error: 'Budget status omitted in fixture' },
  });
  const rootEl = document.createElement('div');
  document.body.appendChild(rootEl);
  const root = createRoot(rootEl);
  t.after(async () => {
    await act(async () => root.unmount());
    rootEl.remove();
    global.fetch = originalFetch;
    dom.window.Storage.prototype.setItem = orig;
    localStorage.clear();
    clock = f.now.getTime();
  });
  await act(async () => root.render(React.createElement(Page)));
  return { el: rootEl, writes, preserved };
}
test('pilot stays separate through data checks, mismatch, higher fees, entry, stale exit rejection and a verified manual exit', async (t) => {
  const { el, writes, preserved } = await mount(t);
  assert.ok(button(el, 'Record Gold Petal paper entry').disabled);
  assert.deepEqual(writes, []);
  await change(el, 'Other losses + open risk', '0');
  await act(async () => button(el, 'Confirm today’s outside risk').click());
  await act(async () => button(el, 'Start on-screen checks').click());
  for (const [l, v] of [
    ['Exact Angel contract', f.contract.symbol],
    ['Completed bar start · IST', '2026-11-23 19:25'],
    ['Completed bar close', '12560'],
    ['Angel last traded price', '1'],
    ['Angel observed quote time · IST', '2026-11-23 19:30:20'],
    ['Angel full round-trip fees at stop (₹)', '55'],
    ['Angel full round-trip fees at target (₹)', '55'],
    ['Fee source / verification note', 'Fixture tariff'],
    ['I matched the contract', true],
    ['I checked the economic calendar', true],
  ])
    await change(el, l, v);
  assert.ok(
    button(el, 'Record Gold Petal paper entry').disabled,
    'mismatched price blocks entry'
  );
  await change(el, 'Angel last traded price', '12560');
  await change(el, 'Angel full round-trip fees at stop (₹)', '150');
  assert.ok(
    button(el, 'Record Gold Petal paper entry').disabled,
    'higher costs block entry'
  );
  await change(el, 'Angel full round-trip fees at stop (₹)', '55');
  assert.equal(button(el, 'Record Gold Petal paper entry').disabled, false);
  await act(async () => button(el, 'Record Gold Petal paper entry').click());
  let book = p.parsePetalBook(localStorage.getItem(p.PETAL_BOOK_KEY));
  assert.equal(book.positions.length, 1);
  assert.equal(book.positions[0].exit, undefined);
  await act(async () =>
    button(el, 'Use latest bid less ₹5 as paper exit').click()
  );
  clock += 31000;
  await act(async () => button(el, 'Record paper exit').click());
  assert.match(el.textContent, /Refresh the exact saved contract/);
  assert.equal(
    p.parsePetalBook(localStorage.getItem(p.PETAL_BOOK_KEY)).positions[0].exit,
    undefined
  );
  await change(el, 'Paper exit price', '12540');
  await change(el, 'Full charges + rounding reserve', '60');
  await change(
    el,
    'Exit price/time verification reference',
    'Angel 19:31 verified paper exit after interruption'
  );
  await act(async () => button(el, 'Record paper exit').click());
  book = p.parsePetalBook(localStorage.getItem(p.PETAL_BOOK_KEY));
  assert.equal(book.positions[0].exit.net, -85);
  assert.equal(book.positions[0].exit.source, 'BROKER_MANUAL');
  assert.ok(writes.every((k) => k === p.PETAL_BOOK_KEY));
  for (const [k, v] of Object.entries(preserved))
    assert.equal(localStorage.getItem(k), v, k);
});
test('corrupted stock or pilot storage blocks entries without overwriting records', async (t) => {
  const { el, writes } = await mount(t);
  localStorage.setItem('paper_trading_book_v1', 'unreadable');
  await act(async () => window.dispatchEvent(new Event('storage')));
  assert.ok(button(el, 'Record Gold Petal paper entry').disabled);
  assert.match(el.textContent, /Stock paper journals cannot be read/);
  assert.equal(localStorage.getItem('paper_trading_book_v1'), 'unreadable');
  localStorage.setItem(p.PETAL_BOOK_KEY, 'invalid');
  await act(async () => window.dispatchEvent(new Event('storage')));
  assert.ok(button(el, 'Record Gold Petal paper entry').disabled);
  assert.equal(localStorage.getItem(p.PETAL_BOOK_KEY), 'invalid');
});
