require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  createAngelBudget,
  angelBudgetKey,
} = require('../lib/angelRateLimit.ts');
const config = () => ({
  url: 'https://fixture.upstash.io',
  token: 'private-fixture',
  client: 'fixture-account',
});
const time = 1800000000000;
const result = (granted, wait = 0, reason = 'ready') =>
  Response.json({ result: [granted, wait, time, 1, 2, 3, reason] });
test('reservation is an atomic EVAL with a stable account key and no broker secrets', async () => {
  let body, init;
  const gate = createAngelBudget({
    config,
    fetcher: async (_, options) => {
      init = options;
      body = JSON.parse(options.body);
      return result(1);
    },
  });
  await gate.acquire();
  assert.equal(body[0], 'EVAL');
  assert.equal(body[2], 1);
  assert.equal(body[3], angelBudgetKey(' FIXTURE-account '));
  assert.equal(body[4], 'acquire');
  assert.equal(body.length, 7);
  assert.equal(init.redirect, 'error');
  assert.ok(!JSON.stringify(body).includes('fixture-account'));
  assert.ok(!JSON.stringify(body).includes('private-fixture'));
});
test('normal pacing waits for the next shared slot; long windows return explicit wait without polling', async () => {
  let calls = 0,
    now = time;
  const waits = [];
  const gate = createAngelBudget({
    config,
    now: () => now,
    pause: async (ms) => {
      waits.push(ms);
      now += ms;
    },
    fetcher: async () =>
      ++calls === 1 ? result(0, 2000, 'pacing') : result(1),
  });
  await gate.acquire();
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
  for (const [reason, kind] of [
    ['budget', 'SHARED_LIMIT'],
    ['warming', 'TRACKING_WARMUP'],
    ['provider', 'SHARED_LIMIT'],
  ]) {
    const paused = createAngelBudget({
      config,
      fetcher: async () => result(0, 60000, reason),
      pause: async () => assert.fail('must not sleep'),
    });
    await assert.rejects(
      () => paused.acquire(),
      (e) => e.kind === kind && e.retryAfterMs === 60000 && !e.retryable
    );
  }
});
test('store failures and uncertain reservations fail closed once, with redacted errors', async () => {
  for (const response of [
    () => {
      throw new Error('private-fixture');
    },
    () => Response.json({ error: 'private-fixture' }),
    () => Response.json({ result: [1, 0, time, 3, 2, 3, 'ready'] }),
    () => new Response('private-fixture', { status: 500 }),
  ]) {
    let calls = 0;
    const gate = createAngelBudget({
      config,
      fetcher: async () => {
        calls++;
        return response();
      },
    });
    await assert.rejects(
      () => gate.acquire(),
      (e) =>
        e.kind === 'TRACKING_UNAVAILABLE' &&
        !e.retryable &&
        !e.message.includes('private-fixture')
    );
    assert.equal(calls, 1);
  }
});
test('contention is bounded and cancellation prevents another reservation', async () => {
  let calls = 0,
    now = time;
  const gate = createAngelBudget({
    config,
    now: () => now,
    pause: async (ms) => {
      now += ms;
    },
    fetcher: async () => {
      calls++;
      return result(0, 2000, 'pacing');
    },
  });
  await assert.rejects(
    () => gate.acquire(),
    (e) => e.kind === 'SHARED_LIMIT'
  );
  assert.ok(calls <= 9);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() => gate.acquire(abort.signal), /abort/i);
  assert.ok(calls <= 9);
});
test('status and explicit provider holds use the same ledger without consuming a slot', async () => {
  const commands = [];
  const gate = createAngelBudget({
    config,
    fetcher: async (_, options) => {
      commands.push(JSON.parse(options.body));
      return result(0);
    },
  });
  await gate.status();
  await gate.defer(60000);
  await gate.defer(0);
  assert.deepEqual(
    commands.map((c) => [c[4], c[6]]),
    [
      ['status', 0],
      ['pause', 60000],
    ]
  );
  assert.equal(commands[0][3], commands[1][3]);
});
test('missing and partial configuration never sends a request or mixes credentials from different pairs', async (t) => {
  const names = [
    'ANGEL_RATE_REDIS_REST_URL',
    'ANGEL_RATE_REDIS_REST_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'ANGEL_CLIENT_CODE',
  ];
  const old = names.map((n) => process.env[n]);
  names.forEach((n) => delete process.env[n]);
  t.after(() =>
    names.forEach((n, i) =>
      old[i] === undefined ? delete process.env[n] : (process.env[n] = old[i])
    )
  );
  const gate = createAngelBudget({
    fetcher: async () => assert.fail('No network request allowed'),
  });
  await assert.rejects(
    () => gate.acquire(),
    (e) => e.kind === 'TRACKING_UNAVAILABLE'
  );
  process.env.ANGEL_RATE_REDIS_REST_URL = 'https://fixture.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'secret';
  process.env.ANGEL_CLIENT_CODE = 'fixture';
  await assert.rejects(() => gate.acquire(), /not configured/);
});

test('status endpoint reports counters or a safe failure without making a broker request', async (t) => {
  const { angelBudget, ANGEL_LIMITS } = require('../lib/angelRateLimit.ts');
  const { AngelRequestError } = require('../lib/angelErrors.ts');
  const route = require('../app/api/market/data-budget/route.ts');
  const previous = angelBudget.status;
  t.after(() => (angelBudget.status = previous));
  angelBudget.status = async () => ({
    granted: false,
    checkedAt: new Date(time).toISOString(),
    used: { second: 0, minute: 7, hour: 31 },
    retryAfterMs: 0,
    reason: 'ready',
  });
  const response = await route.GET({ signal: new AbortController().signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const data = await response.json();
  assert.deepEqual(data.limits, ANGEL_LIMITS);
  assert.equal(data.used.hour, 31);
  angelBudget.status = async () => {
    throw new AngelRequestError(
      'TRACKING_UNAVAILABLE',
      503,
      false,
      'Tracking unavailable; broker paused.'
    );
  };
  const failed = await route.GET({ signal: new AbortController().signal });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).success, false);
});
