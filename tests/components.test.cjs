require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://paper.example.test',
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
Object.defineProperty(navigator, 'locks', {
  value: { request: async (_key, fn) => fn() },
});
const React = require('react'),
  { createRoot } = require('react-dom/client'),
  { Simulate } = require('react-dom/test-utils');
const { act } = React;
const f = require('./readiness-fixtures.cjs'),
  b = require('../lib/paperBook.ts');
const context = require('../contexts/AppContext.tsx');
const realUseApp = context.useApp;
const DataStatus = require('../components/DataStatusPanel.tsx');
const Research = require('../components/ResearchChecklist.tsx').default;
const Charges = require('../components/BrokerChargesPanel.tsx').default;
const News = require('../components/NewsContext.tsx').default;
const { usePaperBook } = require('../hooks/usePaperBook.ts');
const OriginalDate = Date;
const fixedNow = f.now.getTime();
global.Date = class extends OriginalDate {
  constructor(...args) {
    super(...(args.length ? args : [fixedNow]));
  }
  static now() {
    return fixedNow;
  }
};
const fixture = {
  prices: { SBIN: f.quote },
  candles: { SBIN: f.bars(), NIFTY: f.bars(24000) },
  quoteFeed: {
    state: 'PARTIAL',
    errors: [{ symbol: 'TCS', message: 'Provider timeout' }],
    attemptedAt: f.now.toISOString(),
  },
  candleFeed: { state: 'OK', receivedAt: f.now.toISOString(), errors: [] },
};
context.useApp = () => fixture;
async function mount(component, t) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(component));
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });
  return { root, container };
}
const findButton = (container, text) =>
  [...container.querySelectorAll('button')].find((x) =>
    x.textContent.includes(text)
  );
async function change(container, label, value) {
  const el = [...container.querySelectorAll('label')]
    .find((x) => x.textContent.trim() === label)
    ?.querySelector('input,textarea,select');
  assert.ok(el, `field ${label}`);
  await act(async () => Simulate.change(el, { target: { value } }));
}

test('scanner can pause background market polling without changing either saved study or journal', async (t) => {
  const previousFetch = global.fetch;
  const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', {
    value: false,
    configurable: true,
  });
  let requests = 0;
  global.fetch = async (url) => {
    requests++;
    return Response.json(
      url.endsWith('/candles')
        ? { success: true, candles: {}, errors: [] }
        : { success: true, quotes: [], errors: [] }
    );
  };
  t.after(() => {
    global.fetch = previousFetch;
    if (hidden) Object.defineProperty(document, 'hidden', hidden);
    else delete document.hidden;
  });
  const study = JSON.stringify({
    ...b.emptyPaperBook(),
    research: { symbols: ['RELIANCE', 'TCS', 'HDFCBANK'] },
  });
  const scanner = JSON.stringify(require('./fixtures/scanner-v1-closed.json'));
  localStorage.setItem('paper_trading_book_v1', study);
  localStorage.setItem('scanner_paper_journal_v1', scanner);
  const { root } = await mount(
    React.createElement(
      context.AppProvider,
      { autoRefresh: false },
      React.createElement('div')
    ),
    t
  );
  assert.equal(requests, 0);
  await act(async () =>
    root.render(
      React.createElement(
        context.AppProvider,
        { autoRefresh: true },
        React.createElement('div')
      )
    )
  );
  assert.equal(requests, 2);
  await act(async () =>
    root.render(
      React.createElement(
        context.AppProvider,
        { autoRefresh: false },
        React.createElement('div')
      )
    )
  );
  assert.equal(localStorage.getItem('paper_trading_book_v1'), study);
  assert.equal(localStorage.getItem('scanner_paper_journal_v1'), scanner);
});

test('status panel shows provider failures and exchange timestamps alongside current data', async (t) => {
  const { container } = await mount(
    React.createElement(DataStatus.default, {
      symbols: ['SBIN'],
      now: f.now,
      optional: DataStatus.optionalFeedsInitial,
    }),
    t
  );
  assert.match(container.textContent, /TCS: Provider timeout/);
  assert.match(container.textContent, /SBIN · quote Current · candles Current/);
  assert.match(container.textContent, /09:45:05 IST/);
  assert.match(container.textContent, /Hugging Face \/ FinBERT · NOT CHECKED/);
});
test('cost calculator distinguishes the ₹50 risk check from the net R:R check', async (t) => {
  const { container } = await mount(
    React.createElement(Charges, {
      book: b.emptyPaperBook(),
      symbols: ['SBIN'],
      ready: true,
      busy: false,
      riskBudget: 50,
      cash: 9500,
      transact: async () => {},
      action: async (fn) => fn(),
    }),
    t
  );
  assert.match(container.textContent, /Total risk: ₹49.96 \/ ₹50.00/);
  assert.match(container.textContent, /Does not fit this budget \/ net R:R/);
  assert.equal(findButton(container, 'Save charge comparison').disabled, true);
  await change(container, 'Slippage allowance (₹)', '0.25');
  await change(container, 'Tax-rounding reserve (₹)', '0');
  assert.match(container.textContent, /Fits these cost assumptions only/);
  assert.match(container.textContent, /your charges unverified/);
});
test('supervised form starts empty and stores independent matching evidence through the journal hook', async (t) => {
  localStorage.clear();
  let latest, actionError;
  function Harness() {
    const journal = usePaperBook();
    latest = journal;
    return React.createElement(Research, {
      book: journal.book,
      symbols: ['SBIN'],
      ready: journal.ready,
      busy: false,
      now: f.now,
      transact: journal.transact,
      action: async (fn) => {
        try {
          await fn();
        } catch (e) {
          actionError = e;
        }
      },
    });
  }
  const { container } = await mount(React.createElement(Harness), t);
  assert.match(container.textContent, /Pending \/ needs review/);
  await act(async () => findButton(container, 'Capture app snapshot').click());
  assert.equal(
    findButton(container, 'Save independent comparison').disabled,
    true
  );
  const inputs = {
    'Broker stock LTP': '200',
    'Broker quote time (IST)': '09:45:05',
    'Broker candle start (IST)': '09:40:00',
    'Broker stock open': '200',
    'Broker stock high': '201',
    'Broker stock low': '199',
    'Broker stock close': '200',
    'Broker stock volume': '100',
    'Broker NIFTY open': '24000',
    'Broker NIFTY high': '24001',
    'Broker NIFTY low': '23999',
    'Broker NIFTY close': '24000',
  };
  for (const [label, value] of Object.entries(inputs))
    await change(container, label, value);
  assert.equal(
    findButton(container, 'Save independent comparison').disabled,
    false
  );
  await act(async () =>
    findButton(container, 'Save independent comparison').click()
  );
  assert.equal(actionError, undefined);
  assert.match(container.textContent, /SBIN: Comparison matched today/);
  assert.equal(latest.book.research.comparisons[0].passed, true);
  const stored = localStorage.getItem(b.PAPER_BOOK_KEY);
  assert.deepEqual(b.parsePaperBook(stored, f.now), latest.book);
  await change(container, 'Broker candle start (IST)', '09:35:00');
  await act(async () =>
    findButton(container, 'Save independent comparison').click()
  );
  assert.equal(actionError, undefined);
  assert.match(
    container.textContent,
    /Broker candle start time does not match/
  );
  assert.match(container.textContent, /Pending \/ needs review/);
  assert.equal(latest.book.positions.length, 0);
  // A corrupt external replacement must survive a rejected transaction.
  localStorage.setItem(b.PAPER_BOOK_KEY, '{corrupt');
  await assert.rejects(() => latest.transact((book) => book));
  assert.equal(localStorage.getItem(b.PAPER_BOOK_KEY), '{corrupt');
});
test('closed-session UI cannot capture observations or count a weekend review', async (t) => {
  const { container } = await mount(
    React.createElement(Research, {
      book: b.emptyPaperBook(),
      symbols: ['SBIN'],
      ready: true,
      busy: false,
      now: new OriginalDate('2026-11-21T10:00:00+05:30'),
      transact: async () => {},
      action: async () => {},
    }),
    t
  );
  assert.equal(findButton(container, 'Capture app snapshot').disabled, true);
  assert.equal(
    findButton(container, 'Record today’s session review').disabled,
    true
  );
  assert.match(container.textContent, /Pending market hours/);
});
test('HF billing failure is visible; three headlines trigger only one failed classification request', async (t) => {
  const oldFetch = global.fetch;
  t.after(() => (global.fetch = oldFetch));
  let hfCalls = 0,
    status;
  global.fetch = async (url) => {
    if (url.startsWith('/api/news'))
      return Response.json({
        success: true,
        news: [1, 2, 3].map((i) => ({
          title: `Company headline ${i}`,
          link: `https://example.com/${i}`,
          source: 'Fixture',
          publishedAt: f.now.toISOString(),
        })),
      });
    hfCalls++;
    return Response.json(
      {
        success: false,
        providerStatus: 402,
        error: 'Hugging Face billing / credits unavailable.',
      },
      { status: 502 }
    );
  };
  const { container } = await mount(
    React.createElement(News, {
      symbol: 'SBIN',
      onStatus: (value) => (status = value),
    }),
    t
  );
  assert.equal(hfCalls, 0);
  await act(async () =>
    findButton(container, 'Check recent headlines').click()
  );
  assert.equal(hfCalls, 1);
  assert.equal(container.querySelectorAll('article').length, 3);
  assert.match(container.textContent, /billing \/ credits/);
  assert.equal(status.news.state, 'OK');
  assert.equal(status.sentiment.state, 'UNAVAILABLE');
});

test('provider state preserves the fixed study universe and clears failed quotes without overlapping refreshes', async (t) => {
  const oldFetch = global.fetch;
  t.after(() => (global.fetch = oldFetch));
  const research = require('../lib/researchEvidence.ts');
  const snapshot = research.captureComparison(
    'SBIN',
    f.quote,
    f.bars(),
    f.bars(24000),
    f.now
  );
  const book = research.recordComparison(
    b.emptyPaperBook(),
    ['SBIN'],
    snapshot,
    f.broker(snapshot),
    f.now
  );
  localStorage.setItem(b.PAPER_BOOK_KEY, JSON.stringify(book));
  localStorage.setItem('watchlist', JSON.stringify(['TCS']));
  let current,
    calls = 0,
    fail = false;
  global.fetch = async (url, options) => {
    calls++;
    const requested = JSON.parse(options.body).items.map((x) => x.symbol);
    assert.deepEqual(requested, ['SBIN', 'TCS']);
    return fail
      ? Response.json(
          { success: false, error: 'Provider authentication expired' },
          { status: 502 }
        )
      : Response.json({
          success: true,
          quotes: [
            {
              symbol: 'SBIN',
              price: 200,
              exchangeTime: f.quote.exchangeTime,
              lastUpdated: f.quote.lastUpdated,
            },
          ],
          errors: [{ symbol: 'TCS', error: 'Fixture missing quote' }],
        });
  };
  function Consumer() {
    current = realUseApp();
    return null;
  }
  await mount(
    React.createElement(
      context.AppProvider,
      null,
      React.createElement(Consumer)
    ),
    t
  );
  await act(async () =>
    Promise.all([current.updatePrices(), current.updatePrices()])
  );
  assert.equal(calls, 1);
  assert.equal(current.quoteFeed.state, 'PARTIAL');
  assert.equal(current.prices.SBIN.price, 200);
  assert.equal(current.prices.TCS, undefined);
  assert.equal(current.quoteFeed.errors[0].message, 'Fixture missing quote');
  fail = true;
  await act(async () => current.updatePrices());
  assert.equal(current.quoteFeed.state, 'ERROR');
  assert.deepEqual(current.prices, {});
  assert.match(current.quoteFeed.errors[0].message, /authentication expired/);
});

test('paper entry stays blocked until comparison passes and rechecks the latest stored evidence on click', async (t) => {
  const strategy = require('../lib/paperStrategy.ts');
  const research = require('../lib/researchEvidence.ts');
  const scannerFixture = require('./scanner-journal-fixtures.cjs').entered(
    'BSE'
  );
  const scannerJournal = require('../lib/scannerJournal.ts');
  const originalSetup = strategy.findPaperSetup;
  const originalContext = context.useApp;
  t.after(() => {
    strategy.findPaperSetup = originalSetup;
    context.useApp = originalContext;
  });
  const setup = {
    id: 'cash-pullback-v1:SBIN:fixture',
    version: strategy.STRATEGY_VERSION,
    symbol: 'SBIN',
    side: 'BUY',
    barTime: '2026-11-20T09:40:00+05:30',
    createdAt: '2026-11-20T09:45:00+05:30',
    expiresAt: '2026-11-20T09:55:00+05:30',
    entry: 200,
    stop: 196,
    target: 208,
    tickSize: 0.01,
  };
  strategy.findPaperSetup = () => ({ setup, reasons: [] });
  context.useApp = () => ({
    ...fixture,
    watchlist: ['SBIN'],
    candleWarnings: [],
    updatePrices: async () => {},
    updateCandles: async () => {},
  });
  localStorage.clear();
  const Page = require('../app/signals/page.tsx').default;
  const { container } = await mount(React.createElement(Page), t);
  await change(container, 'Round-trip charges (₹)', '13');
  await change(container, 'Slippage reserve (₹)', '0');
  await change(
    container,
    'Session / event notes',
    'Fixture: supervised and events reviewed.'
  );
  await act(async () =>
    Simulate.change(container.querySelector('input[type="checkbox"]'), {
      target: { checked: true },
    })
  );
  assert.equal(
    findButton(container, 'Record paper entry at ask').disabled,
    true
  );
  const snap = research.captureComparison(
    'SBIN',
    f.quote,
    f.bars(),
    f.bars(24000),
    f.now
  );
  const matched = research.recordComparison(
    b.emptyPaperBook(),
    ['SBIN'],
    snap,
    f.broker(snap),
    f.now
  );
  localStorage.setItem(b.PAPER_BOOK_KEY, JSON.stringify(matched));
  await act(async () => window.dispatchEvent(new Event('paperBookUpdated')));
  assert.equal(
    findButton(container, 'Record paper entry at ask').disabled,
    false
  );
  const failed = research.recordComparison(
    matched,
    ['SBIN'],
    snap,
    { ...f.broker(snap), ltp: 201 },
    f.now
  );
  localStorage.setItem(b.PAPER_BOOK_KEY, JSON.stringify(failed));
  await act(async () =>
    findButton(container, 'Record paper entry at ask').click()
  );
  assert.match(
    container.textContent,
    /Today’s supervised comparison is pending or failed/
  );
  assert.equal(
    JSON.parse(localStorage.getItem(b.PAPER_BOOK_KEY)).positions.length,
    0
  );
  localStorage.setItem(b.PAPER_BOOK_KEY, JSON.stringify(matched));
  await act(async () => window.dispatchEvent(new Event('paperBookUpdated')));
  // Simulate another tab opening a scanner trade before its storage event arrives.
  localStorage.setItem(
    scannerJournal.SCANNER_BOOK_KEY,
    JSON.stringify(scannerFixture.book)
  );
  await act(async () =>
    findButton(container, 'Record paper entry at ask').click()
  );
  assert.equal(
    JSON.parse(localStorage.getItem(b.PAPER_BOOK_KEY)).positions.length,
    0
  );
  assert.match(
    container.textContent,
    /Across both journals: Close the existing paper position/
  );
  localStorage.removeItem(scannerJournal.SCANNER_BOOK_KEY);
  await act(async () => window.dispatchEvent(new Event('scannerBookUpdated')));
  await act(async () =>
    findButton(container, 'Record paper entry at ask').click()
  );
  assert.equal(
    JSON.parse(localStorage.getItem(b.PAPER_BOOK_KEY)).positions.length,
    1
  );
  assert.match(container.textContent, /No broker order was sent/);
});
