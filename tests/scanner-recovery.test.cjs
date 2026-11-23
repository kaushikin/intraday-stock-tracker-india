require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const feed = require('../lib/scannerFeed.ts');
const f = require('./scanner-fixtures.cjs');
const u = require('../lib/nifty50.ts');
const universe = {
  members: u.parseNifty50CSV(f.csv),
  source: u.NIFTY50_SOURCE,
  asOf: '2026-11-20',
  checkedAt: f.now.toISOString(),
};
const runtime = {
  now: () => f.now,
  pause: async (_ms, signal) => signal.throwIfAborted(),
};
test('scanner membership recovers from a dropped connection without losing the scan', async () => {
  let calls = 0;
  const result = await feed.loadScannerUniverse(new AbortController().signal, {
    ...runtime,
    fetcher: async () => {
      if (++calls === 1) throw new TypeError('Failed to fetch');
      return Response.json({ success: true, universe });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.members.length, 50);
});
test('unreadable gateway responses retry once and persistent failures give a useful feed-specific error', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      feed.loadScannerUniverse(new AbortController().signal, {
        ...runtime,
        fetcher: async () => {
          calls++;
          return new Response('<html>gateway outage</html>', { status: 502 });
        },
      }),
    /Nifty 50 membership.*unreadable.*502/
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    () =>
      feed.loadScannerUniverse(new AbortController().signal, {
        ...runtime,
        fetcher: async () => {
          calls++;
          return Response.json({ success: false }, { status: 401 });
        },
      }),
    /Sign in again/
  );
  assert.equal(calls, 1);
});
test('cancellation during recovery prevents another request', async () => {
  const abort = new AbortController();
  let calls = 0;
  await assert.rejects(
    () =>
      feed.loadScannerUniverse(abort.signal, {
        ...runtime,
        fetcher: async () => {
          calls++;
          throw new TypeError('Failed to fetch');
        },
        pause: async () => {
          abort.abort();
        },
      }),
    /abort/i
  );
  assert.equal(calls, 1);
});
