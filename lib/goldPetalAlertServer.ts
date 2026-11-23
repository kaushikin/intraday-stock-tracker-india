import {
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import webpush, { type PushSubscription } from 'web-push';
import {
  alertRedis,
  alertStoreKey,
  type AlertRedis,
} from './goldPetalAlertStore';
import {
  alertCandidate,
  checkAlertRisk,
  type PetalRiskSnapshot,
} from './goldPetalAlerts';
import { loadPetalFeed } from './goldPetalServer';
import { petalSessionProblem } from './goldPetalMarket';
import { istDateKey } from './marketHours';

export const ALERT_ORIGIN = 'https://intraday-stock-tracker-india.vercel.app';
export const ALERT_TICK_PATH = '/api/alerts/gold-petal/tick';
const SCHEDULE_ID = 'intraday-india-gold-petal-v1';
type Secrets = { publicKey: string; privateKey: string; callback: string };
type Watch = {
  revision: string;
  risk: PetalRiskSnapshot;
  subscription: PushSubscription;
  armedAt: string;
  expiresAt: string;
  confirmed: boolean;
};
type ClosedPageTest = {
  id: string;
  revision: string;
  state: 'queued' | 'sent' | 'error' | 'expired' | 'cancelled';
  notBefore: string;
  expiresAt: string;
  message: string;
};
type Runtime = {
  redis: AlertRedis;
  key: (s: string) => string;
  now: () => Date;
  feed: typeof loadPetalFeed;
  push: typeof webpush.sendNotification;
  fetcher: typeof fetch;
};
export function validSubscription(value: unknown): PushSubscription {
  const s = value as PushSubscription;
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 2500)
    throw new Error('Invalid browser subscription.');
  const u = new URL(s.endpoint);
  if (
    u.protocol !== 'https:' ||
    u.port ||
    u.username ||
    u.password ||
    u.hash ||
    ![
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'web.push.apple.com',
    ].includes(u.hostname)
  )
    throw new Error(
      'This browser’s push provider is not supported. Use current Chrome, Firefox or Safari.',
    );
  for (const [name, length] of [
    ['p256dh', 65],
    ['auth', 16],
  ] as const) {
    const v = s.keys?.[name];
    if (
      typeof v !== 'string' ||
      !/^[A-Za-z0-9_-]+={0,2}$/.test(v) ||
      Buffer.from(v, 'base64url').length !== length
    )
      throw new Error('Invalid browser subscription keys.');
  }
  return {
    endpoint: s.endpoint,
    keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
  };
}
export function createPetalAlerts(overrides: Partial<Runtime> = {}) {
  const rt: Runtime = {
    redis: alertRedis,
    key: alertStoreKey,
    now: () => new Date(),
    feed: loadPetalFeed,
    push: (...args) => webpush.sendNotification(...args),
    fetcher: (...args) => fetch(...args),
    ...overrides,
  };
  async function get<T>(suffix: string): Promise<T | null> {
    const raw = await rt.redis(['GET', rt.key(suffix)]);
    return raw === null ? null : JSON.parse(raw);
  }
  const set = (suffix: string, value: unknown, seconds = 172800) =>
    rt.redis(['SET', rt.key(suffix), JSON.stringify(value), 'EX', seconds]);
  async function secrets() {
    let keys = await get<Secrets>('secrets');
    if (!keys) {
      const generated = {
        ...webpush.generateVAPIDKeys(),
        callback: randomBytes(32).toString('base64url'),
      };
      await rt.redis([
        'SET',
        rt.key('secrets'),
        JSON.stringify(generated),
        'NX',
      ]);
      keys = await get<Secrets>('secrets');
    }
    if (!keys?.privateKey || !keys.publicKey || !keys.callback)
      throw new Error('Alert keys unavailable.');
    return keys;
  }
  async function send(
    subscription: PushSubscription,
    payload: object,
    ttl: number,
  ) {
    const keys = await secrets();
    await rt.push(validSubscription(subscription), JSON.stringify(payload), {
      TTL: ttl,
      timeout: 8000,
      urgency: 'high',
      vapidDetails: {
        subject: ALERT_ORIGIN,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      },
    });
  }
  async function status() {
    const [keys, schedule, watch, last, heartbeat, closedTest] =
      await Promise.all([
        secrets(),
        get<{ id: string }>('schedule'),
        get<Watch>('watch'),
        get<{ revision: string; at: string; state: string; message: string }>(
          'last',
        ),
        get<{ at: string }>('heartbeat'),
        get<ClosedPageTest>('closed-test'),
      ]);
    const active =
      !!watch &&
      Date.parse(watch.expiresAt) > rt.now().getTime() &&
      watch.risk.day === istDateKey(rt.now());
    return {
      publicKey: keys.publicKey,
      schedulerConnected: !!schedule,
      heartbeat,
      watch: active
        ? {
            revision: watch!.revision,
            armedAt: watch!.armedAt,
            expiresAt: watch!.expiresAt,
            used: watch!.risk.used,
            remaining: 250 - watch!.risk.used,
            fingerprint: watch!.risk.fingerprint,
            confirmed: watch!.confirmed,
            feeFloor: watch!.risk.feeFloor,
          }
        : null,
      last: watch && last?.revision !== watch.revision ? null : last,
      closedTest:
        closedTest?.state === 'queued' &&
        (!active || watch?.revision !== closedTest.revision)
          ? {
              ...closedTest,
              state: 'cancelled',
              message:
                'Test cancelled because the watch stopped, changed or expired.',
            }
          : closedTest?.state === 'queued' &&
              Date.parse(closedTest.expiresAt) <= rt.now().getTime()
            ? {
                ...closedTest,
                state: 'expired',
                message:
                  'No scheduled test delivery was completed in time. Check QStash logs and the last server contact before retrying.',
              }
            : closedTest,
    };
  }
  async function connect(token: string, freeConfirmed: boolean) {
    if (
      freeConfirmed !== true ||
      typeof token !== 'string' ||
      token.length < 20 ||
      token.length > 4000 ||
      /\s/.test(token)
    )
      throw new Error(
        'Select QStash Free and enter its token in this private form.',
      );
    const keys = await secrets();
    // Idempotent schedule ID. No paid plan is selected and the token is not stored.
    const response = await rt.fetcher(
      'https://qstash.upstash.io/v2/schedules/' +
        ALERT_ORIGIN +
        ALERT_TICK_PATH,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Upstash-Cron': '* 12-16 * * 1-5',
          'Upstash-Schedule-Id': SCHEDULE_ID,
          'Upstash-Method': 'POST',
          'Upstash-Retries': '0',
          'Upstash-Forward-Authorization': `Bearer ${keys.callback}`,
        },
        body: '{}',
      },
    );
    if (!response.ok)
      throw new Error(
        'Scheduler connection failed. Check the QStash token and Free plan; no watch was enabled.',
      );
    const result = await response.json();
    if (result.scheduleId !== SCHEDULE_ID)
      throw new Error(
        'Scheduler response was not recognised. Check the QStash console.',
      );
    await set('schedule', { id: SCHEDULE_ID }, 366 * 86400);
  }
  async function arm(
    riskValue: unknown,
    subscriptionValue: unknown,
    acknowledged: boolean,
  ) {
    const now = rt.now(),
      risk = checkAlertRisk(riskValue, now),
      subscription = validSubscription(subscriptionValue);
    if (!acknowledged)
      throw new Error(
        'Confirm that you will update risk before any other trading.',
      );
    const expiresAt = risk.day + 'T21:30:00+05:30';
    if (now.getTime() >= Date.parse(expiresAt))
      throw new Error(
        'Today’s entry window has ended. Enable alerts for the next session.',
      );
    if (!(await get('schedule')))
      throw new Error('Connect the free scheduler first.');
    // An explicit test proves only push-provider acceptance, not device receipt.
    await send(
      subscription,
      {
        title: 'Gold Petal alert test',
        body: 'Test only. If you see this notification, return to the app and confirm it. No trade was recorded.',
        kind: 'TEST',
        expiresAt: now.getTime() + 60000,
      },
      60,
    );
    const watch: Watch = {
      revision: randomUUID(),
      risk,
      subscription,
      armedAt: now.toISOString(),
      expiresAt,
      confirmed: false,
    };
    await set(
      'watch',
      watch,
      Math.max(1, Math.ceil((Date.parse(expiresAt) - now.getTime()) / 1000)),
    );
    return { revision: watch.revision, expiresAt };
  }
  async function stop(revision?: string) {
    if (revision) {
      await rt.redis([
        'EVAL',
        "local raw=redis.call('GET',KEYS[1]); if raw and cjson.decode(raw).revision==ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0",
        1,
        rt.key('watch'),
        revision,
      ]);
    } else await rt.redis(['DEL', rt.key('watch')]);
  }
  async function confirm(revision: string) {
    const result = await rt.redis([
      'EVAL',
      "local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local w=cjson.decode(raw); if w.revision~=ARGV[1] then return 0 end; w.confirmed=true; redis.call('SET',KEYS[1],cjson.encode(w),'KEEPTTL'); return 1",
      1,
      rt.key('watch'),
      revision,
    ]);
    if (result !== 1)
      throw new Error(
        'The alert test expired or was replaced. Enable alerts again.',
      );
  }
  async function queueClosedTest(revision: string) {
    const now = rt.now(),
      watch = await get<Watch>('watch');
    if (!watch || watch.revision !== revision || !watch.confirmed)
      throw new Error(
        'Confirm the first test notification and enable today’s watch before the closed-page test.',
      );
    if (
      petalSessionProblem(now) ||
      Date.parse(watch.expiresAt) - now.getTime() <= 180000
    )
      throw new Error(
        'The closed-page test is available on trading days from 18:00 until 21:27 IST.',
      );
    if (!(await get('schedule')))
      throw new Error('Connect the free scheduler first.');
    if (
      !(await rt.redis(['SET', rt.key('test-throttle'), '1', 'NX', 'EX', 180]))
    )
      throw new Error(
        'The closed-page test was requested recently. Wait three minutes before another test.',
      );
    const test: ClosedPageTest = {
      id: randomUUID(),
      revision,
      state: 'queued',
      notBefore: new Date(now.getTime() + 45000).toISOString(),
      expiresAt: new Date(now.getTime() + 180000).toISOString(),
      message:
        'Test queued. Close every app tab now. Keep the device online and awake; expect a labelled notification in about 1–2 minutes. No test trade is created.',
    };
    await set('closed-test', test);
    return test;
  }
  async function deliverClosedTest(watch: Watch, now: Date) {
    const test = await get<ClosedPageTest>('closed-test');
    if (!test || test.state !== 'queued' || test.revision !== watch.revision)
      return null;
    if (now.getTime() < Date.parse(test.notBefore))
      return { state: 'test-waiting' };
    if (now.getTime() >= Date.parse(test.expiresAt)) {
      await rt.redis([
        'EVAL',
        "local raw=redis.call('GET',KEYS[1]); if raw and cjson.decode(raw).id==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL'); return 1 end; return 0",
        1,
        rt.key('closed-test'),
        test.id,
        JSON.stringify({
          ...test,
          state: 'expired',
          message:
            'The scheduled test did not finish within three minutes. Check QStash logs and notification settings before retrying.',
        }),
      ]);
      return { state: 'test-expired' };
    }
    if (
      !(await rt.redis([
        'SET',
        rt.key('test-claim:' + test.id),
        '1',
        'NX',
        'EX',
        86400,
      ]))
    )
      return { state: 'test-claimed' };
    const latest = await get<Watch>('watch');
    if (
      latest?.revision !== watch.revision ||
      !latest.confirmed ||
      Date.parse(latest.expiresAt) <= rt.now().getTime()
    )
      return { state: 'test-cancelled' };
    let result: ClosedPageTest;
    try {
      await send(
        watch.subscription,
        {
          title: 'Gold Petal · closed-page TEST',
          body: 'Notification test only. The background scheduler sent this after a delay. No market signal, paper trade or broker order was created.',
          kind: 'TEST',
          tag: 'closed-' + test.id,
          expiresAt: rt.now().getTime() + 60000,
        },
        60,
      );
      result = {
        ...test,
        state: 'sent',
        message:
          'Closed-page test accepted by the push provider. Count the test as passed only if you saw its notification while the app was closed.',
      };
    } catch {
      result = {
        ...test,
        state: 'error',
        message:
          'Closed-page test delivery failed or is uncertain. Check notification permission and retry after three minutes. No paper trade was created.',
      };
    }
    // Preserve a newer test if the user requested another while delivery finished.
    await rt.redis([
      'EVAL',
      "local raw=redis.call('GET',KEYS[1]); if raw and cjson.decode(raw).id==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL'); return 1 end; return 0",
      1,
      rt.key('closed-test'),
      test.id,
      JSON.stringify(result),
    ]);
    return { state: result.state === 'sent' ? 'test-sent' : 'test-error' };
  }
  async function authenticate(authorization: string | null) {
    // A callback cannot initialise credentials or use the app login cookie.
    const keys = await get<Secrets>('secrets');
    if (
      !keys ||
      typeof keys.callback !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(keys.callback)
    )
      return false;
    const supplied = Buffer.from(authorization || '');
    const expected = Buffer.from(keys ? `Bearer ${keys.callback}` : '');
    return (
      !!keys &&
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    );
  }
  async function tick(signal: AbortSignal) {
    const now = rt.now();
    if (!(await rt.redis(['SET', rt.key('tick-lock'), '1', 'NX', 'EX', 55])))
      return { state: 'duplicate' };
    await set('heartbeat', { at: now.toISOString() });
    const watch = await get<Watch>('watch');
    if (
      !watch ||
      Date.parse(watch.expiresAt) <= now.getTime() ||
      watch.risk.day !== istDateKey(now)
    )
      return { state: 'off' };
    if (!watch.confirmed) return { state: 'test-not-confirmed' };
    const testResult = await deliverClosedTest(watch, now);
    if (testResult) return testResult;
    const session = petalSessionProblem(now);
    if (session) {
      await set('last', {
        revision: watch.revision,
        at: now.toISOString(),
        state: 'waiting',
        message: session,
      });
      return { state: 'outside-window' };
    }
    try {
      const feed = await rt.feed(signal);
      const candidate = alertCandidate(feed, watch.risk, rt.now());
      const latest = await get<Watch>('watch');
      if (
        latest?.revision !== watch.revision ||
        Date.parse(watch.expiresAt) <= rt.now().getTime()
      )
        return { state: 'cancelled' };
      if (!candidate.plan || candidate.issues.length) {
        await set('last', {
          revision: watch.revision,
          at: rt.now().toISOString(),
          state: 'waiting',
          message: candidate.issues[0] || 'No qualifying setup.',
        });
        return { state: 'waiting' };
      }
      const plan = candidate.plan;
      const dedup =
        'sent:' + createHash('sha256').update(plan.id).digest('hex');
      if (!(await rt.redis(['SET', rt.key(dedup), '1', 'NX', 'EX', 86400])))
        return { state: 'already-notified' };
      try {
        await send(
          watch.subscription,
          {
            title: 'Gold Petal · paper candidate to verify',
            body: `${feed.contract!.symbol}: planned risk ₹${plan.plannedRisk.toFixed(2)} incl. costs. Fits your last confirmed daily allowance. Open and recheck data, fees and risk before any paper entry.`,
            kind: 'CANDIDATE',
            tag: plan.id,
            expiresAt: rt.now().getTime() + 30000,
          },
          30,
        );
      } catch {
        // Do not replay an uncertain delivery as a fresh opportunity.
        await set('last', {
          revision: watch.revision,
          at: rt.now().toISOString(),
          state: 'error',
          message:
            'Push delivery failed or is uncertain. Reconnect notifications and test again. This candle will not be resent.',
        });
        return { state: 'push-error' };
      }
      await set('last', {
        revision: watch.revision,
        at: rt.now().toISOString(),
        state: 'sent',
        message:
          'Candidate sent to the push provider. Device delivery is not guaranteed; open the app to recheck.',
        risk: plan.plannedRisk,
      });
      return { state: 'sent' };
    } catch {
      await set('last', {
        revision: watch.revision,
        at: rt.now().toISOString(),
        state: 'error',
        message:
          'Background check or delivery tracking failed. A notification may already be in flight. Open the app and recheck; later scheduled checks still use the shared limits.',
      });
      return { state: 'error' };
    }
  }
  return {
    status,
    connect,
    arm,
    stop,
    confirm,
    queueClosedTest,
    authenticate,
    tick,
  };
}
export const petalAlerts = createPetalAlerts();
