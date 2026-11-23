require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  createAngelReader,
  decodeAngelResponse,
} = require('../lib/angelTransport.ts');
const url =
  'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData';
function fixture(fetcher) {
  let time = 0;
  const waits = [];
  return {
    waits,
    read: createAngelReader({
      fetcher,
      now: () => time,
      pause: async (ms, signal) => {
        signal?.throwIfAborted();
        waits.push(ms);
        time += ms;
      },
    }),
  };
}
test('plain-text Angel 403 rate limits recover after a bounded pause without exposing response contents', async () => {
  let calls = 0;
  const f = fixture(async () =>
    ++calls === 1
      ? new Response('Access denied because of exceeding access rate', {
          status: 403,
        })
      : Response.json({ status: true, data: [['real-provider-bar']] })
  );
  const result = await f.read(url, { method: 'POST' }, 'candles');
  assert.deepEqual(result.data, [['real-provider-bar']]);
  assert.equal(calls, 2);
  assert.ok(f.waits.includes(2000));
  await assert.rejects(
    () =>
      decodeAngelResponse(
        new Response('<html>private-token</html>', { status: 502 }),
        'candles'
      ),
    (e) =>
      e.kind === 'UPSTREAM' &&
      /502/.test(e.message) &&
      !e.message.includes('private-token')
  );
});
test('persistent provider failures remain errors, access failures are not retried and Retry-After is respected', async () => {
  for (const [status, body, retries, kind, headers] of [
    [403, 'Access denied because of exceeding access rate', 3, 'RATE_LIMIT'],
    [502, 'gateway', 2, 'UPSTREAM'],
    [200, '<html>bad format</html>', 2, 'FORMAT'],
    [403, 'Permission denied', 1, 'ACCESS'],
    [401, '{}', 1, 'AUTH'],
    [429, 'slow down', 1, 'RATE_LIMIT', { 'retry-after': '60' }],
  ]) {
    let calls = 0;
    const f = fixture(async () => {
      calls++;
      return new Response(body, { status, headers });
    });
    await assert.rejects(
      () => f.read(url, {}, 'candles'),
      (e) => e.kind === kind
    );
    assert.equal(calls, retries);
    if (status === 403 && kind === 'RATE_LIMIT')
      assert.deepEqual(f.waits, [2000, 4000]);
  }
});
test('network reads retry once, cancellation stops retrying, and login is never automatically replayed', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    throw new TypeError('fetch failed');
  });
  await assert.rejects(() => f.read(url, {}, 'candles'), /connection failed/);
  assert.equal(calls, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => f.read(url, { signal: controller.signal }, 'candles'),
    /abort/i
  );
  assert.equal(calls, 2);
  await assert.rejects(() =>
    f.read('https://apiconnect.angelone.in/login', {}, 'login', false)
  );
  assert.equal(calls, 3);
});
test('concurrent read calls are serialized and paced even when they enter from different routes', async () => {
  let active = 0,
    maximum = 0;
  const f = fixture(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active--;
    return Response.json({ status: true, data: [] });
  });
  await Promise.all([
    f.read(url, {}, 'candles'),
    f.read(url, {}, 'candles'),
    f.read(url, {}, 'candles'),
  ]);
  assert.equal(maximum, 1);
  assert.deepEqual(f.waits, [1100, 1100]);
});
test('simultaneous cold-session requests share a single login', async (t) => {
  const transport = require('../lib/angelTransport.ts');
  const angel = require('../lib/angel.ts');
  const original = transport.readAngel,
    oldSession = global.angelSessionCache;
  const names = [
    'ANGEL_API_KEY',
    'ANGEL_CLIENT_CODE',
    'ANGEL_PIN',
    'ANGEL_TOTP_SECRET',
  ];
  const env = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  t.after(() => {
    transport.readAngel = original;
    global.angelSessionCache = oldSession;
    for (const n of names)
      env[n] === undefined ? delete process.env[n] : (process.env[n] = env[n]);
  });
  names.forEach((n) => (process.env[n] = 'fixture'));
  global.angelSessionCache = undefined;
  let calls = 0;
  transport.readAngel = async () => {
    calls++;
    await Promise.resolve();
    return { data: { jwtToken: 'fixture-session' } };
  };
  const sessions = await Promise.all([
    angel.getAngelSession(),
    angel.getAngelSession(),
  ]);
  assert.equal(calls, 1);
  assert.equal(sessions[0], sessions[1]);
});

test('a queued request cancels immediately without waiting for or starting another provider call', async () => {
  let release,
    calls = 0;
  const f = fixture(async () => {
    calls++;
    await new Promise((r) => (release = r));
    return Response.json({ status: true, data: [] });
  });
  const first = f.read(url, {}, 'candles');
  await Promise.resolve();
  const abort = new AbortController();
  const second = f.read(url, { signal: abort.signal }, 'candles');
  abort.abort();
  await assert.rejects(() => second, /abort/i);
  assert.equal(calls, 1);
  release();
  await first;
  await Promise.resolve();
  assert.equal(calls, 1);
});
