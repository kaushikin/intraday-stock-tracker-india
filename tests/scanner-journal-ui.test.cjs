require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', {
  url: 'https://scanner-paper.example.test',
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
const queues = new Map(),
  locks = [];
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: {
    request: async (key, fn) => {
      locks.push(key);
      const task = (queues.get(key) || Promise.resolve()).then(fn);
      queues.set(
        key,
        task.catch(() => {})
      );
      return task;
    },
  },
});
global.IS_REACT_ACT_ENVIRONMENT = true;
const f = require('./scanner-journal-fixtures.cjs'),
  j = require('../lib/scannerJournal.ts'),
  b = require('../lib/paperBook.ts');
const OriginalDate = Date;
let current = f.now.getTime();
global.Date = class extends OriginalDate {
  constructor(...a) {
    super(...(a.length ? a : [current]));
  }
  static now() {
    return current;
  }
};
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client'),
  { Simulate } = require('react-dom/test-utils');
const Component = require('../components/ScannerJournal.tsx').default,
  { useScannerBook } = require('../hooks/useScannerBook.ts');
const feed = require('../lib/scannerFeed.ts');
const find = (el, text) =>
  [...el.querySelectorAll('button')].find((x) => x.textContent === text);
async function field(el, label, value) {
  const l = [...el.querySelectorAll('label')].find(
    (x) => x.firstChild?.textContent === label
  );
  assert.ok(l, label);
  const i = l.querySelector('input,textarea,select');
  await act(async () => Simulate.change(i, { target: { value } }));
}
async function mount(t, component) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(component));
  t.after(async () => {
    await act(async () => root.unmount());
    el.remove();
    localStorage.clear();
    current = f.now.getTime();
    locks.length = 0;
  });
  return { el, root };
}
const props = () => ({
  context: f.context(),
  selected: 'SBIN',
  now: new Date(),
  scanBusy: false,
  recheck: () => {},
});

test('history selector keeps old 2R results separate without migrating stored records', async (t) => {
  const old = require('./fixtures/scanner-v1-closed.json');
  const raw = JSON.stringify(old);
  localStorage.setItem(j.SCANNER_BOOK_KEY, raw);
  current = f.now.getTime() + 120000;
  const { el } = await mount(
    t,
    React.createElement(Component, { ...props(), context: null, selected: '' })
  );
  assert.match(el.textContent, /3R v2 only: 0 closed/);
  await field(el, 'Scanner results version', 'cash-pullback-v1');
  assert.match(el.textContent, /2R v1 history only: 1 closed/);
  assert.match(el.textContent, /target ₹216.65/);
  await field(el, 'Scanner results version', 'scanner-cash-3r-v2');
  assert.match(el.textContent, /3R v2 only: 0 closed/);
  assert.equal(localStorage.getItem(j.SCANNER_BOOK_KEY), raw);
  assert.equal(localStorage.getItem(b.PAPER_BOOK_KEY), null);
});

test('scanner UI records independent comparison, exact fees, entry and exit without changing study bytes', async (t) => {
  localStorage.setItem(b.PAPER_BOOK_KEY, JSON.stringify(b.emptyPaperBook()));
  localStorage.setItem('watchlist', JSON.stringify(f.fixed));
  const before = localStorage.getItem(b.PAPER_BOOK_KEY),
    watch = localStorage.getItem('watchlist');
  const original = feed.fetchScannerQuote;
  feed.fetchScannerQuote = async () => ({
    ...f.quote,
    exchangeTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  });
  t.after(() => (feed.fetchScannerQuote = original));
  const { el, root } = await mount(t, React.createElement(Component, props()));
  assert.match(el.textContent, /Scanner paper journal/);
  assert.equal(find(el, 'Record scanner paper entry at ask').disabled, true);
  await act(async () => find(el, 'Capture scanner comparison').click());
  assert.match(el.textContent, /Completed candle start .*09:40:00 IST/);
  const values = {
    'Broker stock LTP': '202.21',
    'Broker exchange quote time (IST)': '09:45:05',
    'Broker candle start time (IST)': '09:40:00',
    'Broker stock open': '200',
    'Broker stock high': '202.2',
    'Broker stock low': '195',
    'Broker stock close': '202.1',
    'Broker stock candle volume': '100',
    'Broker NIFTY open': '200',
    'Broker NIFTY high': '202.2',
    'Broker NIFTY low': '195',
    'Broker NIFTY close': '202.1',
  };
  for (const [label, value] of Object.entries(values))
    await field(el, label, value);
  await act(async () => find(el, 'Save scanner comparison').click());
  assert.match(el.textContent, /Scanner comparison matched today/);
  const v = f.verified(),
    check = v.book.feeChecks[0];
  await field(el, 'Broker total charges at stop (₹)', String(check.atStop));
  await field(el, 'Broker total charges at target (₹)', String(check.atTarget));
  await field(
    el,
    'Fee source/reference and account differences',
    'Independent broker calculator example'
  );
  await act(async () => find(el, 'Save scanner fee check').click());
  assert.match(el.textContent, /fee check is saved/);
  await field(
    el,
    'Event check and supervision notes',
    'Scheduled events checked. Available to supervise.'
  );
  const checkbox = [...el.querySelectorAll('label')]
    .find((x) => x.textContent.includes('I checked scheduled'))
    .querySelector('input');
  await act(async () =>
    Simulate.change(checkbox, { target: { checked: true } })
  );
  assert.equal(find(el, 'Record scanner paper entry at ask').disabled, false);
  await act(async () => {
    find(el, 'Record scanner paper entry at ask').click();
    find(el, 'Record scanner paper entry at ask').click();
  });
  let saved = j.parseScannerBook(localStorage.getItem(j.SCANNER_BOOK_KEY));
  assert.equal(saved.positions.length, 1);
  assert.match(el.textContent, /Open scanner paper position · SBIN/);
  assert.equal(localStorage.getItem(b.PAPER_BOOK_KEY), before);
  assert.equal(localStorage.getItem('watchlist'), watch);
  assert.ok(
    locks.includes(b.PAPER_BOOK_KEY) && locks.includes(j.SCANNER_BOOK_KEY)
  );
  current += 60000;
  await act(async () => root.render(React.createElement(Component, props())));
  await field(el, 'Observed scanner exit price (₹)', '202.2');
  await field(el, 'Total estimated round-trip exit charges (₹)', '15');
  await field(el, 'Observed exit timestamp (IST)', '2026-11-20T09:46:05');
  await field(
    el,
    'Exit source and supervision notes',
    'Observed Angel One bid; manual operational exit.'
  );
  await act(async () => find(el, 'Record scanner paper exit').click());
  saved = j.parseScannerBook(localStorage.getItem(j.SCANNER_BOOK_KEY));
  assert.equal(saved.positions[0].exitedAt, '2026-11-20T04:16:05.000Z');
  assert.equal(j.scannerStats(saved).count, 1);
  assert.match(el.textContent, /1 closed/);
  assert.equal(localStorage.getItem(b.PAPER_BOOK_KEY), before);
  assert.equal(localStorage.getItem('watchlist'), watch);
  await act(async () => root.render(null));
  await act(async () => root.render(React.createElement(Component, props())));
  assert.match(el.textContent, /1 closed/);
});
test('fee draft survives quote expiry and recheck while a changed plan resets it', async (t) => {
  const { el, root } = await mount(t, React.createElement(Component, props()));
  await field(el, 'Broker total charges at stop (₹)', '12.50');
  current += 31000;
  await act(async () => root.render(React.createElement(Component, props())));
  let input = [...el.querySelectorAll('label')]
    .find(
      (l) => l.firstChild?.textContent === 'Broker total charges at stop (₹)'
    )
    .querySelector('input');
  assert.equal(input.value, '12.50');
  assert.equal(find(el, 'Record scanner paper entry at ask').disabled, true);
  const fresh = props();
  fresh.context.data.quotes.SBIN.exchangeTime = new Date().toISOString();
  fresh.context.data.quotes.SBIN.lastUpdated = new Date().toISOString();
  await act(async () => root.render(React.createElement(Component, fresh)));
  assert.equal(input.value, '12.50');
  fresh.context.config.cash = 600;
  await act(async () => root.render(React.createElement(Component, fresh)));
  assert.equal(input.value, '');
});
test('storage quota errors preserve prior scanner data and corrupt journals fail closed with recovery available', async (t) => {
  const raw = JSON.stringify(j.emptyScannerBook());
  localStorage.setItem(j.SCANNER_BOOK_KEY, raw);
  let hook;
  function Harness() {
    hook = useScannerBook();
    return React.createElement('span', null, hook.error);
  }
  const { root } = await mount(t, React.createElement(Harness));
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function (key, value) {
    if (key === j.SCANNER_BOOK_KEY) throw new Error('Quota exceeded');
    return original.call(this, key, value);
  };
  try {
    await assert.rejects(
      () =>
        hook.transact((book) =>
          j.addScannerObservation(book, 'SESSION', 'A note')
        ),
      /Quota/
    );
    assert.equal(localStorage.getItem(j.SCANNER_BOOK_KEY), raw);
  } finally {
    dom.window.Storage.prototype.setItem = original;
  }
  localStorage.setItem(j.SCANNER_BOOK_KEY, 'broken-json');
  await act(async () => window.dispatchEvent(new Event('storage')));
  assert.equal(hook.ready, false);
  await assert.rejects(() => hook.transact((book) => book));
  assert.equal(localStorage.getItem(j.SCANNER_BOOK_KEY), 'broken-json');
  await assert.rejects(
    () => hook.restore(j.emptyScannerBook(), false),
    /explicitly confirm/
  );
  await act(async () => hook.restore(j.emptyScannerBook(), true));
  assert.equal(hook.ready, true);
  await act(async () => root.render(React.createElement(Component, props())));
  assert.match(document.body.textContent, /Export raw scanner backup/);
});
test('simultaneous scanner writes re-read storage under shared locks and allow only one position', async (t) => {
  const v = f.verified();
  localStorage.setItem(j.SCANNER_BOOK_KEY, JSON.stringify(v.book));
  let hook;
  function Harness() {
    hook = useScannerBook();
    return null;
  }
  await mount(t, React.createElement(Harness));
  let result;
  await act(async () => {
    result = await Promise.allSettled(
      [1, 2].map(() =>
        hook.transact(
          (book, study, fixed) =>
            j.openScannerPosition(
              book,
              study,
              fixed,
              v.context,
              'Reviewed events',
              true
            ),
          true
        )
      )
    );
  });
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    j.parseScannerBook(localStorage.getItem(j.SCANNER_BOOK_KEY)).positions
      .length,
    1
  );
});
test('Settings rejects scanner files and overlapping study restores before changing any storage', async (t) => {
  const v = f.entered();
  localStorage.setItem(j.SCANNER_BOOK_KEY, JSON.stringify(v.book));
  localStorage.setItem(b.PAPER_BOOK_KEY, JSON.stringify(b.emptyPaperBook()));
  localStorage.setItem('watchlist', JSON.stringify(f.fixed));
  const before = [b.PAPER_BOOK_KEY, 'watchlist', j.SCANNER_BOOK_KEY].map((k) =>
    localStorage.getItem(k)
  );
  const Backup = require('../components/BackupRestorePanel.tsx').default;
  const oldConfirm = window.confirm,
    oldError = console.error;
  window.confirm = () => true;
  console.error = () => {};
  t.after(() => {
    window.confirm = oldConfirm;
    console.error = oldError;
  });
  const { el } = await mount(t, React.createElement(Backup));
  async function upload(data) {
    await act(async () =>
      Simulate.change(el.querySelector('input[type="file"]'), {
        target: {
          files: [
            { name: 'fixture.json', text: async () => JSON.stringify(data) },
          ],
          value: '',
        },
      })
    );
  }
  await upload(v.book);
  assert.match(el.textContent, /cannot be imported into Practice/);
  const position = structuredClone(
    require('./fixtures/scanner-v1-open.json').positions[0]
  );
  delete position.origin;
  delete position.proof;
  await upload({
    app: 'intraday-stock-tracker-india',
    version: 2,
    data: {
      paperBook: { ...b.emptyPaperBook(), positions: [position] },
      watchlist: ['TCS'],
      trades: [],
    },
  });
  assert.match(el.textContent, /overlaps/);
  assert.deepEqual(
    [b.PAPER_BOOK_KEY, 'watchlist', j.SCANNER_BOOK_KEY].map((k) =>
      localStorage.getItem(k)
    ),
    before
  );
});
