require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const f = require('./gold-petal-fixtures.cjs');
const { alertCandidate, checkAlertRisk } = require('../lib/goldPetalAlerts.ts');
const {
  createPetalAlerts,
  validSubscription,
  ALERT_ORIGIN,
} = require('../lib/goldPetalAlertServer.ts');
const webpush = require('web-push');
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  keys: {
    p256dh: webpush.generateVAPIDKeys().publicKey,
    auth: Buffer.alloc(16, 3).toString('base64url'),
  },
};
const risk = (overrides = {}) => ({
  day: '2026-11-23',
  used: 0,
  equity: 30000,
  declared: true,
  openCount: 0,
  entriesToday: 0,
  fingerprint: 'a'.repeat(64),
  feeFloor: { stop: 55, target: 55 },
  ...overrides,
});
function runtime() {
  let now = f.now.getTime(),
    providerError = false,
    pushError = false,
    feedCalls = 0;
  const data = new Map(),
    pushes = [],
    requests = [];
  const redis = async (args) => {
    const [cmd, key, ...rest] = args;
    for (const [k, value] of data)
      if (value.expires && value.expires <= now) data.delete(k);
    if (cmd === 'GET') return data.get(key)?.raw ?? null;
    if (cmd === 'SET') {
      if (rest.includes('NX') && data.has(key)) return null;
      const ex = rest.indexOf('EX');
      data.set(key, {
        raw: rest[0],
        expires: ex < 0 ? 0 : now + Number(rest[ex + 1]) * 1000,
      });
      return 'OK';
    }
    if (cmd === 'DEL') return Number(data.delete(key));
    if (cmd === 'EVAL') {
      const k = rest[1],
        revision = rest[2],
        entry = data.get(k);
      if (!entry) return 0;
      const w = JSON.parse(entry.raw);
      if (key.includes('cjson.decode(raw).id==ARGV[1]')) {
        if (w.id !== revision) return 0;
        entry.raw = rest[3];
        return 1;
      }
      if (w.revision !== revision) return 0;
      if (key.includes('w.confirmed=true')) {
        w.confirmed = true;
        entry.raw = JSON.stringify(w);
        return 1;
      }
      return Number(data.delete(k));
    }
    throw new Error('Unexpected redis command ' + cmd);
  };
  const api = createPetalAlerts({
    redis,
    key: (s) => s,
    now: () => new Date(now),
    feed: async () => {
      feedCalls++;
      if (providerError) throw new Error('secret broker failure');
      const feed = f.feed();
      for (const k of ['exchangeTime', 'tradeTime', 'receivedAt'])
        feed.quote[k] = new Date(now).toISOString();
      return feed;
    },
    push: async (sub, payload, options) => {
      if (pushError) throw new Error('secret push endpoint');
      pushes.push({ sub, payload: JSON.parse(payload), options });
      return {};
    },
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({ scheduleId: 'intraday-india-gold-petal-v1' }),
      };
    },
  });
  return {
    api,
    data,
    pushes,
    requests,
    advance: (ms) => (now += ms),
    providerError: () => (providerError = true),
    pushError: () => (pushError = true),
    calls: () => feedCalls,
  };
}
test('background candidates preserve structural stops, normal fees, daily loss and funding gates', () => {
  assert.ok(alertCandidate(f.feed(), risk(), f.now).plan);
  assert.equal(
    alertCandidate(
      f.feed(),
      risk({ used: 100, feeFloor: { stop: 121, target: 121 } }),
      f.now,
    ).plan.plannedRisk,
    150,
  );
  assert.equal(
    alertCandidate(
      f.feed(),
      risk({ feeFloor: { stop: 121.01, target: 121.01 } }),
      f.now,
    ).plan,
    undefined,
  );
  assert.equal(
    alertCandidate(f.feed(), risk({ used: 200 }), f.now).plan,
    undefined,
  );
  assert.equal(
    alertCandidate(f.feed(), risk({ equity: 10000 }), f.now).plan,
    undefined,
  );
  assert.equal(
    alertCandidate(
      f.feed(),
      risk({ feeFloor: { stop: 150, target: 150 } }),
      f.now,
    ).plan,
    undefined,
  );
  const stale = f.feed();
  stale.quote.exchangeTime = new Date(f.now.getTime() - 31000).toISOString();
  assert.equal(alertCandidate(stale, risk(), f.now).plan, undefined);
  const missing = f.feed();
  missing.errors.push('Provider unavailable');
  assert.equal(alertCandidate(missing, risk(), f.now).plan, undefined);
  for (const change of [
    { declared: false },
    { entriesToday: 1 },
    { openCount: 1 },
    { used: 250 },
    { used: -1 },
    { day: '2026-11-22' },
    { equity: NaN },
  ])
    assert.throws(() => checkAlertRisk(risk(change), f.now));
});
test('push destinations cannot be arbitrary URLs or local network targets', () => {
  assert.equal(validSubscription(subscription).endpoint, subscription.endpoint);
  for (const endpoint of [
    'http://fcm.googleapis.com/x',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.evil.test/x',
    'https://fcm.googleapis.com:444/x',
    'https://user:pass@fcm.googleapis.com/x',
  ])
    assert.throws(() => validSubscription({ ...subscription, endpoint }));
  assert.throws(() =>
    validSubscription({
      ...subscription,
      keys: { auth: 'bad', p256dh: 'bad' },
    }),
  );
});
test('closed-page scheduler uses its own secret, fixed destination, zero retries and one idempotent free-sized schedule', async () => {
  const r = runtime();
  assert.equal(await r.api.authenticate('Bearer invalid'), false);
  await assert.rejects(r.api.connect('x'.repeat(30), false));
  await r.api.connect('x'.repeat(30), true);
  const request = r.requests[0];
  assert.equal(
    request.url,
    'https://qstash.upstash.io/v2/schedules/' +
      ALERT_ORIGIN +
      '/api/alerts/gold-petal/tick',
  );
  assert.equal(request.options.headers['Upstash-Cron'], '* 12-16 * * 1-5');
  assert.equal(request.options.headers['Upstash-Retries'], '0');
  assert.equal(
    await r.api.authenticate(
      request.options.headers['Upstash-Forward-Authorization'],
    ),
    true,
  );
  assert.ok(!JSON.stringify(await r.api.status()).includes('privateKey'));
  assert.ok(![...r.data.values()].some((v) => v.raw.includes('x'.repeat(30))));
});
test('test confirmation is required; a server tick without a page sends once per completed candle and never creates a trade', async () => {
  const r = runtime();
  await r.api.connect('x'.repeat(30), true);
  const watch = await r.api.arm(risk(), subscription, true);
  assert.equal(r.pushes.length, 1);
  assert.equal(r.pushes[0].payload.kind, 'TEST');
  assert.equal(
    (await r.api.tick(new AbortController().signal)).state,
    'test-not-confirmed',
  );
  assert.equal(r.calls(), 0);
  await r.api.confirm(watch.revision);
  r.advance(60000);
  assert.equal((await r.api.tick(new AbortController().signal)).state, 'sent');
  assert.equal(r.pushes.length, 2);
  assert.match(r.pushes[1].payload.body, /last confirmed daily allowance/);
  assert.equal(r.pushes[1].options.TTL, 30);
  assert.equal(
    (await r.api.tick(new AbortController().signal)).state,
    'duplicate',
  );
  r.advance(60000);
  assert.equal(
    (await r.api.tick(new AbortController().signal)).state,
    'already-notified',
  );
  assert.equal(r.pushes.length, 2);
  assert.ok(
    [...r.data.keys()].every(
      (k) => !k.includes('journal') && !k.includes('paper_pilot'),
    ),
  );
});
test('daily expiry, stop, changed revision and depleted allowance suppress unattended candidates', async () => {
  for (const mode of ['expiry', 'stop', 'daily']) {
    const r = runtime();
    await r.api.connect('x'.repeat(30), true);
    const w = await r.api.arm(
      risk(mode === 'daily' ? { used: 200 } : {}),
      subscription,
      true,
    );
    await r.api.confirm(w.revision);
    if (mode === 'expiry') r.advance(3 * 3600000);
    if (mode === 'stop') await r.api.stop(w.revision);
    await r.api.tick(new AbortController().signal);
    assert.equal(r.pushes.length, 1, mode);
  }
  const r = runtime();
  await r.api.connect('x'.repeat(30), true);
  const first = await r.api.arm(risk(), subscription, true);
  const second = await r.api.arm(risk(), subscription, true);
  await r.api.stop(first.revision);
  assert.equal((await r.api.status()).watch.revision, second.revision);
  await assert.rejects(r.api.confirm(first.revision));
});
test('provider and push failures are visible without leaking secrets or sending false candidates', async () => {
  for (const mode of ['provider', 'push']) {
    const r = runtime();
    await r.api.connect('x'.repeat(30), true);
    const w = await r.api.arm(risk(), subscription, true);
    await r.api.confirm(w.revision);
    mode === 'provider' ? r.providerError() : r.pushError();
    await r.api.tick(new AbortController().signal);
    const status = await r.api.status();
    assert.equal(status.last.state, 'error');
    assert.ok(!JSON.stringify(status).includes('secret'));
    assert.equal(r.pushes.length, 1);
  }
});
test('callback rejects missing credentials, and setup rejects foreign origins before any store/provider access', async (t) => {
  const server = require('../lib/goldPetalAlertServer.ts');
  const original = server.petalAlerts.authenticate;
  server.petalAlerts.authenticate = async () => false;
  t.after(() => (server.petalAlerts.authenticate = original));
  const tick = require('../app/api/alerts/gold-petal/tick/route.ts');
  assert.equal(
    (
      await tick.POST(
        new Request(ALERT_ORIGIN + '/api/alerts/gold-petal/tick', {
          method: 'POST',
        }),
      )
    ).status,
    401,
  );
  const setup = require('../app/api/alerts/gold-petal/route.ts');
  assert.equal(
    (
      await setup.POST(
        new Request(ALERT_ORIGIN + '/api/alerts/gold-petal', {
          method: 'POST',
          headers: { Origin: 'https://evil.test' },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
});

test('closed-page test waits for a scheduled callback, sends once, and never fetches market data or changes the watch', async () => {
  const r = runtime();
  await r.api.connect('x'.repeat(30), true);
  const watch = await r.api.arm(risk(), subscription, true);
  await assert.rejects(r.api.queueClosedTest(watch.revision));
  await r.api.confirm(watch.revision);
  const before = r.data.get('watch').raw;
  await r.api.queueClosedTest(watch.revision);
  await assert.rejects(r.api.queueClosedTest(watch.revision));
  assert.equal(
    (await r.api.tick(new AbortController().signal)).state,
    'test-waiting',
  );
  assert.equal(r.pushes.length, 1);
  r.advance(60000);
  assert.equal(
    (await r.api.tick(new AbortController().signal)).state,
    'test-sent',
  );
  assert.equal(r.pushes.length, 2);
  assert.equal(r.pushes[1].payload.title, 'Gold Petal · closed-page TEST');
  assert.equal(r.pushes[1].payload.kind, 'TEST');
  assert.equal(r.calls(), 0);
  assert.equal(r.data.get('watch').raw, before);
  assert.equal((await r.api.status()).closedTest.state, 'sent');
  assert.equal(
    (await r.api.tick(new AbortController().signal)).state,
    'duplicate',
  );
  assert.equal(r.pushes.length, 2);
});
test('closed-page test cancels with a stopped watch and expires without blocking future candidate checks', async () => {
  for (const mode of ['stop', 'expire', 'failure']) {
    const r = runtime();
    await r.api.connect('x'.repeat(30), true);
    const watch = await r.api.arm(risk(), subscription, true);
    await r.api.confirm(watch.revision);
    await r.api.queueClosedTest(watch.revision);
    if (mode === 'stop') await r.api.stop(watch.revision);
    if (mode === 'expire') r.advance(181000);
    else r.advance(60000);
    if (mode === 'failure') r.pushError();
    const result = await r.api.tick(new AbortController().signal);
    assert.equal(
      result.state,
      { stop: 'off', expire: 'test-expired', failure: 'test-error' }[mode],
    );
    assert.equal(r.pushes.length, 1, mode);
    assert.equal(r.calls(), 0, mode);
    assert.equal(
      (await r.api.status()).closedTest.state,
      { stop: 'cancelled', expire: 'expired', failure: 'error' }[mode],
    );
    if (mode === 'expire') {
      r.advance(60000);
      await r.api.tick(new AbortController().signal);
      assert.equal(
        r.calls(),
        1,
        'normal market checks resume after a missed test',
      );
    }
  }
});
