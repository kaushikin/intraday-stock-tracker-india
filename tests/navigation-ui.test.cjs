require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', {
  url: 'https://navigation.example.test/market',
});
for (const key of [
  'window',
  'self',
  'document',
  'navigator',
  'HTMLElement',
  'Event',
  'KeyboardEvent',
])
  Object.defineProperty(global, key, {
    value: dom.window[key],
    configurable: true,
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
const Module = require('node:module'),
  load = Module._load;
let pathname = '/market';
Module._load = function (request, ...args) {
  if (request === 'next/navigation') return { usePathname: () => pathname };
  return load.call(this, request, ...args);
};
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client');
const Navigation = require('../components/BottomNav.tsx').default;
Module._load = load;
test('mobile tools remain reachable and close on Escape and navigation, with active page semantics', async (t) => {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  t.after(async () => {
    await act(async () => root.unmount());
    el.remove();
  });
  await act(async () => root.render(React.createElement(Navigation)));
  const more = el.querySelector('#mobile-more-button');
  assert.equal(
    el.querySelectorAll('[aria-current="page"][href="/market"]').length,
    2
  );
  await act(async () => more.click());
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.equal(el.querySelectorAll('#mobile-more-tools a').length, 6);
  assert.ok(el.querySelector('#mobile-more-tools a[href="/settings"]'));
  assert.ok(el.querySelector('#mobile-more-tools a[href="/commodities"]'));
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  );
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, more);
  await act(async () => more.click());
  pathname = '/analytics';
  await act(async () => root.render(React.createElement(Navigation)));
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.ok(el.querySelector('[aria-current="page"][href="/analytics"]'));
});
