'use client';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  alertAction,
  alertFingerprint,
  invalidateChangedAlertRisk,
  readAlertRisk,
} from '@/lib/goldPetalAlertClient';
import { PETAL_ALERT_LOCAL_KEY } from '@/lib/goldPetalAlerts';

type Status = {
  publicKey: string;
  schedulerConnected: boolean;
  heartbeat?: { at: string };
  watch?: {
    revision: string;
    armedAt: string;
    expiresAt: string;
    used: number;
    remaining: number;
    fingerprint: string;
    confirmed: boolean;
    feeFloor: { stop: number; target: number };
  };
  last?: { at: string; state: string; message: string };
  closedTest?: {
    state: string;
    message: string;
    notBefore: string;
    expiresAt: string;
  };
};
const time = (s: string) =>
  new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
export default function GoldPetalBackgroundAlerts({
  feeFloor,
}: {
  feeFloor: { stop: number; target: number };
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [token, setToken] = useState(''),
    [free, setFree] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [note, setNote] = useState('');
  async function load() {
    try {
      const response = await fetch('/api/alerts/gold-petal', {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      if (!response.ok || typeof result.publicKey !== 'string')
        throw new Error(result.error || 'Alert status unavailable.');
      setStatus(result);
      setError('');
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : 'Alert status unavailable.');
    }
  }
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('goldPetalAlertChanged', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('goldPetalAlertChanged', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    const watch = status?.watch;
    if (
      !watch ||
      (feeFloor.stop <= watch.feeFloor.stop &&
        feeFloor.target <= watch.feeFloor.target)
    )
      return;
    void alertAction({ action: 'stop', revision: watch.revision })
      .then(() => {
        setNote(
          'Higher charges were entered. Background alerts stopped; review the fees and enable a new watch.',
        );
        void load();
      })
      .catch(() =>
        setError(
          'Higher charges could not be sent to the background watch. Stop alerts before relying on them.',
        ),
      );
  }, [feeFloor.stop, feeFloor.target, status?.watch?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Alert setup failed.');
    } finally {
      setBusy(false);
    }
  }
  async function enable() {
    if (
      !status ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    )
      throw new Error(
        'Open this app in current Chrome, Firefox or Safari to enable push notifications.',
      );
    // Start the permission prompt directly from the user’s click.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted')
      throw new Error(
        'Notifications are blocked. Allow this site in your browser settings, then try again.',
      );
    const risk = await readAlertRisk(feeFloor);
    await navigator.serviceWorker.register('/sw.js');
    const registration = await new Promise<ServiceWorkerRegistration>(
      (resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                'Notification worker is not ready. Refresh and try again.',
              ),
            ),
          10000,
        );
        navigator.serviceWorker.ready.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (e) => {
            clearTimeout(timer);
            reject(e);
          },
        );
      },
    );
    const key = Uint8Array.from(
      atob(status.publicKey.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      }));
    const armed = await alertAction({
      action: 'arm',
      risk,
      subscription: subscription.toJSON(),
      acknowledged,
    });
    try {
      localStorage.setItem(
        PETAL_ALERT_LOCAL_KEY,
        JSON.stringify({
          revision: armed.revision,
          fingerprint: risk.fingerprint,
          day: risk.day,
        }),
      );
      if (risk.fingerprint !== (await alertFingerprint()))
        throw new Error(
          'Paper risk changed while enabling alerts. Review and try again.',
        );
    } catch (e) {
      await alertAction({ action: 'stop', revision: armed.revision });
      throw e;
    }
    setNote(
      'A test notification was sent. Confirm below only if you received it. Background candidates stay paused until then.',
    );
  }
  const watch = status?.watch;
  const heartbeatLate =
    watch?.confirmed &&
    (!status?.heartbeat ||
      Date.now() - Date.parse(status.heartbeat.at) > 180000);
  return (
    <section
      className="scanner-card space-y-4"
      aria-label="Gold Petal background alerts"
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <Bell className="h-5 w-5 text-amber-200" /> Alerts with the page closed
      </h2>
      <p className="text-sm text-slate-300">
        Get a notification when a paper candidate fits ₹150 including realistic
        costs and your last confirmed ₹250 daily allowance. Open the app to
        verify data, charges and current risk before entering.
      </p>
      <div className="rounded-xl bg-slate-950/50 p-4 text-sm" role="status">
        {!status
          ? 'Alert status unavailable · do not rely on notifications.'
          : !status.schedulerConnected
            ? 'Setup needed · background checks are off.'
            : !watch
              ? 'Scheduler connected · today’s watch is off.'
              : !watch.confirmed
                ? 'Waiting for you to confirm the test notification.'
                : 'Today’s watch is enabled · verify the last server check below.'}
        {watch && (
          <p className="mt-2 text-xs text-slate-400">
            Risk confirmed {time(watch.armedAt)} · remaining ₹
            {watch.remaining.toFixed(2)} · ends {time(watch.expiresAt)}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Last server contact:{' '}
          {status?.heartbeat ? time(status.heartbeat.at) : 'Not received yet'}
        </p>
        {status?.last && (
          <p className="mt-2 text-xs text-slate-300">
            {time(status.last.at)} · {status.last.message}
          </p>
        )}
        {watch?.confirmed && !status?.last && (
          <p className="mt-2 text-xs text-amber-200">
            No check result for this watch yet. During entry hours, wait for its
            first result before relying on alerts.
          </p>
        )}
      </div>
      {heartbeatLate && (
        <p className="text-sm text-amber-200">
          No recent scheduler contact. Before closing the page during
          18:00–21:30 IST, wait for a recent server check. Outside scheduled
          hours, no checks are expected.
        </p>
      )}
      {(error || note) && (
        <p role="alert" className="text-sm text-amber-200">
          {error || note}
        </p>
      )}
      {status?.closedTest && (
        <p
          role="status"
          className="rounded-xl bg-slate-950/50 p-3 text-sm text-amber-200"
        >
          Closed-page test: {status.closedTest.message}
        </p>
      )}
      {!status?.schedulerConnected && (
        <details className="rounded-xl border border-slate-700 p-4">
          <summary className="cursor-pointer text-sm text-teal-200">
            1 · Connect the free background checker
          </summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>
              Open{' '}
              <a
                href="https://console.upstash.com/qstash"
                target="_blank"
                rel="noreferrer"
                className="text-teal-200 underline"
              >
                Upstash QStash
              </a>{' '}
              and sign in, or create a free account if needed. Your existing
              Redis connection does not automatically enable QStash.
            </li>
            <li>
              In QStash, select the <strong>EU region</strong>, then{' '}
              <strong>Free</strong>. This app uses QStash’s default EU
              connection. Do not choose Pay as You Go or a paid plan. If Free is
              unavailable, stop here.
            </li>
            <li>
              Copy <strong>QSTASH_TOKEN</strong> from the EU Quickstart section
              into the private field below. Use the token value only, without
              quotes. Do not use a Redis token or either signing key. Never
              paste it in chat.
            </li>
          </ol>
          <p className="mt-3 text-xs text-slate-400">
            One schedule makes 300 callbacks per weekday, within the currently
            published 1,000/day Free allowance. Market checks run only
            18:00–21:30 IST with a confirmed watch. Existing Vercel and Redis
            usage limits also apply. No plan upgrade is performed. The token is
            used once to connect, then discarded.
          </p>
          <label className="mt-3 block text-sm">
            QStash token
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <label className="mt-3 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={free}
              onChange={(e) => setFree(e.target.checked)}
            />
            I selected QStash Free and checked that no paid upgrade is required.
          </label>
          <button
            className="scanner-secondary mt-3"
            disabled={busy || !free || !token.trim() || !status}
            onClick={() =>
              void run(async () => {
                const value = token.trim();
                setToken('');
                await alertAction({
                  action: 'connect',
                  token: value,
                  freeConfirmed: free,
                });
              })
            }
          >
            Connect free scheduler
          </button>
          <p className="mt-3 text-xs text-slate-400">
            To remove the schedule later, delete{' '}
            <strong>intraday-india-gold-petal-v1</strong> in the QStash console.
            “Stop background alerts” below immediately stops this watch.
          </p>
        </details>
      )}
      <label className="flex gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        I confirmed today’s outside risk above. I will stop or update this watch
        before trading elsewhere. Other devices and broker trades are not
        tracked automatically.
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          className="scanner-primary"
          disabled={busy || !status?.schedulerConnected || !acknowledged}
          onClick={() => void run(enable)}
        >
          Enable today’s alerts + send test
        </button>
        {watch && !watch.confirmed && (
          <button
            className="scanner-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await invalidateChangedAlertRisk();
                await alertAction({
                  action: 'confirm',
                  revision: watch.revision,
                });
                setNote(
                  'Test confirmed. Check for a recent server contact before closing the page.',
                );
              })
            }
          >
            I received the test notification
          </button>
        )}
        {watch?.confirmed && (
          <button
            className="scanner-secondary"
            disabled={busy || status?.closedTest?.state === 'queued'}
            onClick={() =>
              void run(async () => {
                await invalidateChangedAlertRisk();
                const result = await alertAction({
                  action: 'closed-test',
                  revision: watch.revision,
                });
                setNote(result.message);
              })
            }
          >
            Send closed-page test in 1–2 minutes
          </button>
        )}
        <button
          className="scanner-secondary"
          disabled={busy || !status?.schedulerConnected}
          onClick={() =>
            void run(async () => {
              await alertAction({ action: 'stop' });
              localStorage.removeItem(PETAL_ALERT_LOCAL_KEY);
              setNote('Background alerts stopped. No journal was changed.');
            })
          }
        >
          Stop background alerts
        </button>
        <button
          className="scanner-secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          Check alert status
        </button>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">
        To test with the page closed: confirm the first notification, then
        choose “Send closed-page test in 1–2 minutes” between 18:00 and 21:27
        IST on a trading day. Wait for “Test queued”, close all app tabs and
        leave the browser running for this first test. A separate “closed-page
        TEST” notification should arrive. This tests the scheduler and
        notification delivery without fetching market data or creating a trade.
        Candidate scans pause briefly during this test and resume afterward. If
        no test arrives within three minutes, reopen the panel and check its
        status; do not assume it passed.
      </p>
      <p className="text-xs leading-relaxed text-slate-400">
        Enable afresh each day; the watch expires at 21:30 IST. Checks run about
        once a minute through the shared Angel limits. One alert per qualifying
        completed candle; stale or failed data never qualifies. Notifications
        can be delayed or missed by your browser, device, network or Focus
        settings. The page can be closed, but an offline or sleeping device can
        miss alerts. These are candidate alerts, not background exit monitoring
        or guaranteed loss caps. No paper entry or broker order is created.
      </p>
    </section>
  );
}
