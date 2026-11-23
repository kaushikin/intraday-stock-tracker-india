'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
type Status = {
  success: boolean;
  error?: string;
  checkedAt?: string;
  retryAfterMs?: number;
  reason?: string;
  used?: { second: number; minute: number; hour: number };
};
export default function AngelBudgetPanel({ scanBusy }: { scanBusy: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/market/data-budget', {
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (
        typeof data?.success !== 'boolean' ||
        (data.success && (!response.ok || !data.used || !data.checkedAt))
      )
        throw new Error('Unreadable status');
      setStatus(data);
    } catch {
      if (!controller.signal.aborted)
        setStatus({
          success: false,
          error:
            'Unable to check shared tracking. Broker requests will still stop if tracking is unavailable.',
        });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => current.current?.abort();
  }, [refresh, scanBusy]);
  const waiting = status?.success && (status.retryAfterMs || 0) > 0;
  const time = (value: string) =>
    new Date(value).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  return (
    <div
      className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 text-xs"
      aria-label="Angel shared request allowance"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-100">
          Angel request allowance
        </h3>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="text-teal-300 underline disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Refresh status'}
        </button>
      </div>
      <p className="mt-1 text-slate-400">
        Shared across devices and servers · 2/second · 40/minute · 2,000/hour.
        Requests are spaced at least 2 seconds apart.
      </p>
      {!status ? (
        <p className="mt-2 text-slate-300">Checking shared tracking…</p>
      ) : !status.success ? (
        <p role="alert" className="mt-2 text-amber-200">
          {status.error}
        </p>
      ) : (
        <>
          <p className="mt-2 text-teal-200">
            Tracking connected · {status.used?.second}/2 in the last second ·{' '}
            {status.used?.minute}/40 in the last minute · {status.used?.hour}
            /2,000 in the last hour
          </p>
          {waiting && (
            <p className="mt-2 text-amber-200">
              {status.reason === 'warming'
                ? 'First connection or tracking reset: allowing earlier requests to clear safely.'
                : status.reason === 'provider'
                  ? 'Angel requested a wait.'
                  : 'Waiting for the next shared request slot.'}{' '}
              Next check at{' '}
              {time(
                new Date(
                  Date.parse(status.checkedAt!) + status.retryAfterMs!
                ).toISOString()
              )}{' '}
              IST; other requests may extend this.
            </p>
          )}
          <p className="mt-1 text-slate-400">
            Snapshot at {time(status.checkedAt!)} IST. Login and retries count
            too. This checks request tracking, not price freshness or Angel
            availability.
          </p>
        </>
      )}
    </div>
  );
}
