require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  runScannerFeed,
  tryBackgroundCandleFeed,
} = require('../lib/candleFeedLock.ts');
const { lockFixture } = require('./lock-fixture.cjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(t, locks = lockFixture()) {
  const before = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', {
    value: { locks },
    configurable: true,
  });
  t.after(() =>
    before
      ? Object.defineProperty(global, 'navigator', before)
      : delete global.navigator
  );
}
test('one scanner excludes background candles and a second scan until it finishes', async (t) => {
  setup(t);
  const events = [];
  let finish;
  const first = runScannerFeed(new AbortController().signal, async () => {
    events.push('scan 1');
    await new Promise((resolve) => (finish = resolve));
    return 1;
  });
  await tick();
  const second = runScannerFeed(new AbortController().signal, async () => {
    events.push('scan 2');
    return 2;
  });
  await tryBackgroundCandleFeed(async () => {
    events.push('background');
  });
  assert.deepEqual(events, ['scan 1']);
  finish();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  await tick();
  await tryBackgroundCandleFeed(async () => {
    events.push('background');
  });
  assert.deepEqual(events, ['scan 1', 'scan 2', 'background']);
});
test('a scan waits for an existing poll, and cancellation never starts its provider calls', async (t) => {
  setup(t);
  let finish,
    reads = 0;
  const poll = tryBackgroundCandleFeed(
    () => new Promise((resolve) => (finish = resolve))
  );
  await tick();
  const controller = new AbortController();
  const scan = runScannerFeed(controller.signal, async () => reads++);
  controller.abort();
  await assert.rejects(scan, /abort/i);
  finish();
  await poll;
  await tick();
  assert.equal(reads, 0);
  assert.equal(
    await runScannerFeed(new AbortController().signal, async () => ++reads),
    1
  );
});
test('provider errors release the lane and missing browser support retains single-tab reads', async (t) => {
  setup(t);
  await assert.rejects(
    runScannerFeed(new AbortController().signal, async () => {
      throw new Error('provider unavailable');
    }),
    /provider unavailable/
  );
  await tick();
  assert.equal(
    await runScannerFeed(new AbortController().signal, async () => 7),
    7
  );
  delete navigator.locks;
  assert.equal(
    await runScannerFeed(new AbortController().signal, async () => 8),
    8
  );
  let read = false;
  await tryBackgroundCandleFeed(async () => {
    read = true;
  });
  assert.equal(read, true);
});
