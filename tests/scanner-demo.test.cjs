require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', {
  url: 'https://demo.example.test/market/demo',
});
for (const key of [
  'window',
  'self',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'Event',
])
  Object.defineProperty(global, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
const Module = require('node:module');
const load = Module._load;
let pathname = '/market/demo';
Module._load = function (request, ...args) {
  if (request === 'next/navigation')
    return { usePathname: () => pathname };
  return load.call(this, request, ...args);
};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { renderToStaticMarkup } = require('react-dom/server');
const { Simulate } = require('react-dom/test-utils');
const Shell = require('../components/AppShell.tsx').default;
const Page = require('../app/market/demo/page.tsx').default;
const logic = require('../lib/scannerDemo.ts');
const { useApp } = require('../contexts/AppContext.tsx');
Module._load = load;

const button = (el, label) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent === label);
async function click(el, label) {
  const b = button(el, label);
  assert.ok(b, label);
  await act(async () => b.click());
}
async function field(el, label, value) {
  const input = [...el.querySelectorAll('label')]
    .find((l) => l.firstChild?.textContent === label)
    ?.querySelector('input,textarea,select');
  assert.ok(input, label);
  await act(async () => Simulate.change(input, { target: { value } }));
}
async function mountIsolated(t) {
  pathname = '/market/demo';
  const existing = {
    paper_trading_book_v1: JSON.stringify({
      version: 1,
      positions: [],
      observations: [],
      research: { symbols: ['RELIANCE', 'TCS', 'HDFCBANK'] },
    }),
    scanner_paper_journal_v1: JSON.stringify(
      require('./fixtures/scanner-v1-closed.json')
    ),
    trades: '[{"id":"keep-old-trade"}]',
    watchlist: '["RELIANCE","TCS","HDFCBANK"]',
  };
  for (const [key, value] of Object.entries(existing))
    localStorage.setItem(key, value);
  const storage = dom.window.Storage.prototype;
  const original = Object.fromEntries(
    ['getItem', 'setItem', 'removeItem', 'clear'].map((k) => [
      k,
      storage[k],
    ])
  );
  const calls = { storage: 0, network: 0 };
  for (const key of Object.keys(original))
    storage[key] = function () {
      calls.storage++;
      throw new Error('Demo must not access storage');
    };
  const fetch = global.fetch;
  global.fetch = async () => {
    calls.network++;
    throw new Error('Demo must not request live data');
  };
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  let mounted = true;
  const render = () =>
    act(async () =>
      root.render(
        React.createElement(Shell, null, React.createElement(Page))
      )
    );
  t.after(async () => {
    if (mounted) await act(async () => root.unmount());
    el.remove();
    for (const [key, value] of Object.entries(original))
      storage[key] = value;
    global.fetch = fetch;
    localStorage.clear();
    sessionStorage.clear();
    pathname = '/market/demo';
  });
  await render();
  return {
    el,
    calls,
    root,
    render,
    unmount: async () => {
      await act(async () => root.unmount());
      mounted = false;
    },
    checkPreserved: () => {
      assert.deepEqual(calls, { storage: 0, network: 0 });
      for (const [key, value] of Object.entries(existing))
        assert.equal(original.getItem.call(localStorage, key), value, key);
    },
  };
}
async function qualify(el) {
  await click(el, 'Capture demo snapshot');
  await click(el, 'Load matching demo readings');
  await click(el, 'Check demo data');
  await click(el, 'Use demo fee estimates');
  await click(el, 'Check demo fees');
  await field(
    el,
    'Demo event and supervision notes',
    'Demo only: event review and 30-minute supervision rehearsed.'
  );
  const review = [...el.querySelectorAll('input[type="checkbox"]')][0];
  await act(async () =>
    Simulate.change(review, { target: { checked: true } })
  );
}

test('fictional scenario uses the active 3R engine and full charges; invalid readings and fees fail', () => {
  const d = logic.createONGCDemo();
  assert.deepEqual(
    [d.plan.quantity, d.plan.entry, d.plan.stop, d.plan.target],
    [15, 200, 198, 206]
  );
  assert.deepEqual(
    [d.plan.risk, d.plan.reward, d.plan.cashRequired],
    [48.9, 71.1, 3018.9]
  );
  assert.equal(logic.demoExitCharges(d), 13.86);
  assert.ok(logic.checkDemoReadings(d, logic.emptyDemoReadings()).length);
  assert.deepEqual(
    logic.checkDemoReadings(d, logic.matchingDemoReadings()),
    []
  );
  for (const delta of [
    { stockVolume: '14999' },
    { barTime: '09:45:00' },
    { quoteTime: '09:44:00' },
    { indexClose: '24124' },
    { ltp: 'NaN' },
    { quoteTime: '25:00' },
  ])
    assert.ok(
      logic.checkDemoReadings(d, {
        ...logic.matchingDemoReadings(),
        ...delta,
      }).length
    );
  assert.deepEqual(logic.checkDemoFees(d, '12.86', '12.90'), []);
  for (const pair of [
    ['', ''],
    ['0', '0'],
    ['20', '20'],
    ['NaN', '12.90'],
  ])
    assert.ok(logic.checkDemoFees(d, ...pair).length);
  const exit = {
    price: '197.90',
    time: '09:58:00',
    fees: '13.86',
    reason: 'STOP',
    notes: 'Fictional observed bid after stop.',
  };
  assert.deepEqual(logic.checkDemoExit(d, exit), []);
  for (const delta of [
    { price: '198' },
    { time: '09:48:10' },
    { fees: '12.86' },
    { fees: 'Infinity' },
    { fees: '1e308' },
    { reason: 'TARGET' },
    { reason: 'TIME' },
    { notes: '' },
  ])
    assert.ok(logic.checkDemoExit(d, { ...exit, ...delta }).length);
});

test('full demo rejects mismatch and higher fees, rehearses entry/stop exit, and never accesses journals or live data', async (t) => {
  const m = await mountIsolated(t),
    { el } = m;
  assert.match(el.textContent, /Demo only · fictional data/);
  assert.doesNotMatch(el.textContent, /NSE SESSION/);
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  await click(el, 'Capture demo snapshot');
  await click(el, 'Try a volume mismatch');
  await click(el, 'Check demo data');
  assert.match(el.textContent, /Stock candle volume differs/);
  assert.equal(button(el, 'Check demo fees').matches(':disabled'), true);
  await click(el, 'Load matching demo readings');
  await click(el, 'Check demo data');
  await click(el, 'Try higher fees (₹20)');
  await click(el, 'Check demo fees');
  assert.match(el.textContent, /Higher fees exceed this plan/);
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  await qualify(el);
  assert.equal(button(el, 'Simulate demo entry').disabled, false);
  await click(el, 'Simulate demo entry');
  assert.match(el.textContent, /Demo entry simulated at 09:48:10/);
  assert.equal(button(el, 'Check demo data').matches(':disabled'), true);
  await click(el, 'Use demo bid, time and fees');
  await field(el, 'Demo exit reason', 'STOP');
  await field(
    el,
    'Demo exit source and supervision notes',
    'Demo: observed ₹197.90, through the stop at 09:58.'
  );
  await field(el, 'Demo observed exit price (₹)', '198');
  await click(el, 'Simulate demo exit');
  assert.match(el.textContent, /not an assumed ₹198 stop fill/);
  await field(el, 'Demo observed exit price (₹)', '197.90');
  await click(el, 'Simulate demo exit');
  assert.match(el.textContent, /Net demo P\/L: −₹45.36/);
  assert.match(el.textContent, /Demo complete — no journal records saved/);
  assert.equal(
    button(el, 'Simulate demo exit').matches(':disabled'),
    true
  );
  m.checkPreserved();
  await click(el, 'Reset demo');
  assert.equal(el.querySelector('input[type="number"]')?.value ?? '', '');
  assert.doesNotMatch(el.textContent, /Demo complete —/);
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  m.checkPreserved();
});

test('editing checked readings or fees invalidates entry readiness; resetting an open demo clears only memory', async (t) => {
  const m = await mountIsolated(t),
    { el } = m;
  await qualify(el);
  assert.equal(button(el, 'Simulate demo entry').disabled, false);
  await field(el, 'Demo stock candle volume', '14999');
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  assert.match(el.textContent, /2\. Fees: pending/);
  await qualify(el);
  await field(el, 'Demo total charges at target (₹)', '20');
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  await click(el, 'Use demo fee estimates');
  await click(el, 'Check demo fees');
  await click(el, 'Simulate demo entry');
  await click(el, 'Reset demo');
  assert.doesNotMatch(el.textContent, /Demo entry simulated/);
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  m.checkPreserved();
  await qualify(el);
  await click(el, 'Simulate demo entry');
  await act(async () => m.root.render(null));
  await m.render();
  assert.doesNotMatch(el.textContent, /Demo entry simulated/);
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  m.checkPreserved();
});

test('normal app routes retain the shared providers, market status and navigation', () => {
  pathname = '/market';
  function Probe() {
    return React.createElement('p', null, useApp().watchlist.join(', '));
  }
  const html = renderToStaticMarkup(
    React.createElement(Shell, null, React.createElement(Probe))
  );
  assert.match(html, /RELIANCE, TCS, HDFCBANK/);
  assert.match(html, /NSE SESSION/);
  assert.match(html, /href="\/signals"/);
  pathname = '/market/demo';
});

test('each scripted exit validates its own price, timestamp, reason and full costs', () => {
  const demo = logic.createONGCDemo();
  const rows = [
    ['STOP', '197.90', '09:58:00', 13.86, -45.36],
    ['TARGET', '206', '10:02:00', 13.9, 76.1],
    ['TIME', '201', '10:18:10', 13.87, 1.13],
  ];
  for (const [scenario, price, time, fees, net] of rows) {
    const fields = {
      price,
      time,
      fees: String(fees),
      reason: scenario,
      notes: 'Fictional observed outcome only.',
    };
    assert.equal(logic.demoExitCharges(demo, scenario), fees);
    assert.deepEqual(logic.checkDemoExit(demo, fields, scenario), []);
    assert.equal(
      Math.round(((+price - 200) * 15 - fees) * 100) / 100,
      net
    );
    assert.ok(
      logic.checkDemoExit(
        demo,
        { ...fields, fees: String(fees - 1) },
        scenario
      ).length
    );
    assert.ok(
      logic.checkDemoExit(demo, { ...fields, reason: 'MANUAL' }, scenario)
        .length
    );
    for (const [other, otherPrice, otherTime, otherFees] of rows) {
      if (other === scenario) continue;
      assert.ok(
        logic.checkDemoExit(
          demo,
          {
            ...fields,
            price: otherPrice,
            time: otherTime,
            fees: String(otherFees),
            reason: other,
          },
          scenario
        ).length
      );
    }
  }
  assert.match(
    logic
      .checkDemoExit(
        demo,
        {
          price: '201',
          time: '10:18:09',
          fees: '13.87',
          reason: 'TIME',
          notes: 'Too early.',
        },
        'TIME'
      )
      .join(' '),
    /30 minutes after entry/
  );
  assert.ok(
    logic.checkDemoExit(
      demo,
      {
        price: '205.99',
        time: '10:02:00',
        fees: '13.90',
        reason: 'TARGET',
        notes: 'Below target.',
      },
      'TARGET'
    ).length
  );
  assert.throws(() => logic.demoExitCharges(demo, 'UNKNOWN'), /supported/);
});

for (const example of [
  {
    scenario: 'TARGET',
    label: 'Target-hit exit',
    price: '206',
    time: '10:02:00',
    fees: '13.9',
    net: '+₹76.10',
  },
  {
    scenario: 'TIME',
    label: '30-minute time exit',
    price: '201',
    time: '10:18:10',
    fees: '13.87',
    net: '+₹1.13',
  },
]) {
  test(`${example.label} completes with its own costs and no journal or live-data access`, async (t) => {
    const m = await mountIsolated(t),
      { el } = m;
    await field(el, 'Demo exit scenario', example.scenario);
    assert.match(
      el.textContent,
      new RegExp(`Selected exercise: ${example.label}`)
    );
    await qualify(el);
    await click(el, 'Simulate demo entry');
    await click(el, 'Use demo bid, time and fees');
    const form = (label) =>
      [...el.querySelectorAll('label')]
        .find((l) => l.firstChild?.textContent === label)
        .querySelector('input');
    assert.equal(
      form('Demo observed exit price (₹)').value,
      example.price
    );
    assert.equal(
      form('Demo observed exit time (IST)').value,
      example.time
    );
    assert.equal(
      form('Demo total round-trip exit charges (₹)').value,
      example.fees
    );
    assert.ok(
      el.textContent.includes(`Exercise clock: ${example.time} IST`)
    );
    await field(
      el,
      'Demo exit source and supervision notes',
      'Fictional observation for this scenario.'
    );
    await field(el, 'Demo exit reason', 'STOP');
    await click(el, 'Simulate demo exit');
    assert.match(
      el.textContent,
      /Choose the reason matching the observed event/
    );
    assert.doesNotMatch(el.textContent, /Demo complete —/);
    await field(el, 'Demo exit reason', example.scenario);
    if (example.scenario === 'TIME') {
      await field(el, 'Demo observed exit time (IST)', '10:18:09');
      await click(el, 'Simulate demo exit');
      assert.match(el.textContent, /30 minutes after entry/);
      await field(el, 'Demo observed exit time (IST)', example.time);
    }
    await click(el, 'Simulate demo exit');
    assert.ok(el.textContent.includes(`Net demo P/L: ${example.net}`));
    assert.ok(
      el.textContent.includes(
        `gross P/L: ${example.scenario === 'TARGET' ? '+₹90.00' : '+₹15.00'}`
      )
    );
    assert.equal(
      button(el, 'Simulate demo exit').matches(':disabled'),
      true
    );
    m.checkPreserved();
    await click(el, 'Reset demo');
    assert.ok(
      el.textContent.includes(`Selected exercise: ${example.label}`)
    );
    assert.doesNotMatch(el.textContent, /Demo complete —/);
    assert.equal(button(el, 'Simulate demo entry').disabled, true);
    await field(el, 'Demo exit scenario', 'STOP');
    assert.match(el.textContent, /Selected exercise: Stop-loss exit/);
    m.checkPreserved();
  });
}

test('switching an open or closed scenario discards only exercise state and requires fresh checks', async (t) => {
  const m = await mountIsolated(t),
    { el } = m;
  await qualify(el);
  await click(el, 'Simulate demo entry');
  await click(el, 'Use demo bid, time and fees');
  await field(el, 'Demo exit scenario', 'TARGET');
  assert.doesNotMatch(el.textContent, /Demo entry simulated/);
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  assert.match(el.textContent, /1\. Data: pending/);
  assert.match(el.textContent, /2\. Fees: pending/);
  await qualify(el);
  await click(el, 'Simulate demo entry');
  await click(el, 'Use demo bid, time and fees');
  await field(el, 'Demo exit reason', 'TARGET');
  await field(
    el,
    'Demo exit source and supervision notes',
    'Fictional target.'
  );
  await click(el, 'Simulate demo exit');
  assert.match(el.textContent, /Net demo P\/L: \+₹76.10/);
  await field(el, 'Demo exit scenario', 'TIME');
  assert.doesNotMatch(el.textContent, /Demo complete —/);
  assert.doesNotMatch(el.textContent, /Net demo P\/L/);
  assert.equal(button(el, 'Simulate demo entry').disabled, true);
  m.checkPreserved();
});
