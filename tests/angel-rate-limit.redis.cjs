// Uses a dedicated local test Redis. No live credentials or account ledger.
// REDIS_CLI_BIN=/path/to/redis-cli REDIS_TEST_PORT=16389 npm run test:redis
require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const { execFile } = require('node:child_process'),
  { promisify } = require('node:util'),
  { randomUUID } = require('node:crypto');
const {
  ANGEL_BUDGET_SCRIPT,
  ANGEL_TRACKING_WARMUP_MS,
} = require('../lib/angelRateLimit.ts');
const exec = promisify(execFile),
  bin = process.env.REDIS_CLI_BIN,
  port = process.env.REDIS_TEST_PORT;
if (!bin || !/^\d+$/.test(port || ''))
  throw new Error(
    'Set REDIS_CLI_BIN and REDIS_TEST_PORT for a dedicated local test server.'
  );
const command = async (...args) => {
  const { stdout } = await exec(
    bin,
    ['-h', '127.0.0.1', '-p', port, '--json', ...args.map(String)],
    { maxBuffer: 2e6 }
  );
  return JSON.parse(stdout);
};
const now = 1800000000000;
// Test-only clock substitution. Production always obtains Redis TIME atomically.
const scriptAt = (time) =>
  ANGEL_BUDGET_SCRIPT.replace(
    "local clock = redis.call('TIME')",
    `local clock = {${Math.floor(time / 1000)}, ${(time % 1000) * 1000}}`
  );
async function keyFor(t, warm = true) {
  const key = 'angel-test:' + randomUUID();
  t.after(() => command('DEL', key));
  if (warm)
    await command('ZADD', key, -(now - 1), '__warmup__', -1, '__pause__');
  return key;
}
const evalAt = (key, time, mode = 'acquire', delay = 0) =>
  command('EVAL', scriptAt(time), 1, key, mode, randomUUID(), delay);
test('new or lost ledger waits a full prior hour plus in-flight grace; restarts preserve history', async (t) => {
  const key = await keyFor(t, false);
  const initial = await evalAt(key, now);
  assert.equal(initial[0], 0);
  assert.equal(initial[1], ANGEL_TRACKING_WARMUP_MS);
  assert.equal(initial[6], 'warming');
  assert.equal((await evalAt(key, now + ANGEL_TRACKING_WARMUP_MS - 1))[0], 0);
  assert.equal((await evalAt(key, now + ANGEL_TRACKING_WARMUP_MS))[0], 1);
  assert.equal(
    (await evalAt(key, now + ANGEL_TRACKING_WARMUP_MS, 'status'))[5],
    1
  );
  await command('DEL', key);
  assert.equal(
    (await evalAt(key, now + ANGEL_TRACKING_WARMUP_MS))[1],
    ANGEL_TRACKING_WARMUP_MS
  );
});
test('many independent workers cannot reserve the same shared slot', async (t) => {
  const key = await keyFor(t);
  const results = await Promise.all(
    Array.from({ length: 25 }, () => evalAt(key, now))
  );
  assert.equal(results.filter((r) => r[0] === 1).length, 1);
  assert.equal((await evalAt(key, now + 1999))[0], 0);
  const next = await evalAt(key, now + 2000);
  assert.equal(next[0], 1);
  assert.equal(next[5], 2);
});
test('rolling second/minute/hour caps hold across boundaries with existing counted attempts', async (t) => {
  for (const [window, cap, countIndex] of [
    [1000, 2, 3],
    [60000, 40, 4],
    [3600000, 2000, 5],
  ]) {
    const key = await keyFor(t),
      args = [];
    // Put all reservations near the start of the chosen window.
    for (let i = 0; i < cap; i++) args.push(now - window + 500, 'r' + i);
    await command('ZADD', key, ...args);
    const blocked = await evalAt(key, now);
    assert.equal(blocked[0], 0);
    assert.equal(blocked[countIndex], cap);
    assert.equal((await evalAt(key, now + 499))[0], 0);
    // Seconds also obey the stricter 2-second spacing.
    const permitted = await evalAt(key, now + (window === 1000 ? 1500 : 500));
    assert.equal(permitted[0], 1);
    assert.ok(permitted[countIndex] <= cap);
  }
});
test('shared provider Retry-After cannot be shortened by another worker', async (t) => {
  const key = await keyFor(t);
  await evalAt(key, now, 'pause', 60000);
  await evalAt(key, now, 'pause', 1000);
  const held = await evalAt(key, now + 59999);
  assert.equal(held[0], 0);
  assert.equal(held[1], 1);
  assert.equal(held[6], 'provider');
  assert.equal((await evalAt(key, now + 60000))[0], 1);
});
test('status does not spend slots, ledger survives idle time, and backward clocks are conservative', async (t) => {
  const key = await keyFor(t);
  await evalAt(key, now);
  const back = await evalAt(key, now - 10000);
  assert.equal(back[0], 0);
  assert.equal(back[2], now);
  const status = await evalAt(key, now + 7200000, 'status');
  assert.equal(status[5], 0);
  assert.equal(status[6], 'ready');
  assert.equal(await command('TTL', key), -1);
  assert.equal((await evalAt(key, now + 7200000))[0], 1);
  assert.equal(await command('ZCARD', key), 4);
});
