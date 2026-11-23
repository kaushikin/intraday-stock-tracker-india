'use client';
import { useEffect, useRef, useState } from 'react';
import { runScannerFeed } from '@/lib/candleFeedLock';
import {
  compareLatestCandles,
  comparisonQuoteIssue,
  fetchFeedComparison,
  type FeedComparison,
  type ComparisonQuote,
} from '@/lib/feedComparison';
import { displayTime } from './DataStatusPanel';

const number = (value?: number) =>
  Number.isFinite(value)
    ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 6 })
    : 'Not received';
const button =
  'rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold disabled:opacity-40';
function Quote({
  name,
  quote,
  now,
}: {
  name: string;
  quote?: ComparisonQuote;
  now: Date;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-950 p-3 text-xs">
      <p className="font-semibold">
        {name} · {comparisonQuoteIssue(quote, now)}
      </p>
      <p className="mt-2">Last price ₹{number(quote?.price)}</p>
      <p>
        Bid ₹{number(quote?.bid)} · ask ₹{number(quote?.ask)}
      </p>
      <p className="mt-2">Provider feed time: {displayTime(quote?.feedTime)}</p>
      <p>Last trade time: {displayTime(quote?.tradeTime)}</p>
      <p>Received: {displayTime(quote?.receivedAt)}</p>
    </div>
  );
}
export default function UpstoxComparisonPanel({
  selected,
  scanBusy,
  now,
}: {
  selected: string;
  scanBusy: boolean;
  now: Date | null;
}) {
  const [symbol, setSymbol] = useState(selected || 'ONGC');
  const [configured, setConfigured] = useState<boolean | null>(null),
    [setupError, setSetupError] = useState('');
  const [result, setResult] = useState<FeedComparison | null>(null),
    [error, setError] = useState('');
  const [busy, setBusy] = useState(false),
    [waiting, setWaiting] = useState(false),
    [nextCheck, setNextCheck] = useState(0);
  const controller = useRef<AbortController | null>(null),
    statusController = useRef<AbortController | null>(null),
    mounted = useRef(false);
  async function checkSetup() {
    statusController.current?.abort();
    const abort = new AbortController();
    statusController.current = abort;
    setSetupError('');
    try {
      const response = await fetch('/api/market/upstox-comparison', {
        cache: 'no-store',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Sign in again to check Upstox setup.'
            : 'Could not check Upstox setup. Try again.'
        );
      const data = await response.json();
      if (typeof data.configured !== 'boolean')
        throw new Error('Could not read Upstox setup status.');
      if (mounted.current && !abort.signal.aborted)
        setConfigured(data.configured);
    } catch (e) {
      if (mounted.current && !abort.signal.aborted) {
        setConfigured(null);
        setSetupError(e instanceof Error ? e.message : 'Setup check failed.');
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    void checkSetup();
    const hide = () => {
      if (document.hidden) controller.current?.abort();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      statusController.current?.abort();
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  useEffect(() => {
    if (selected) {
      controller.current?.abort();
      setSymbol(selected);
      setResult(null);
      setError('');
    }
  }, [selected]);
  async function compare() {
    if (
      controller.current ||
      scanBusy ||
      !configured ||
      document.hidden ||
      Date.now() < nextCheck
    )
      return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setWaiting(true);
    setError('');
    setResult(null);
    try {
      const data = await runScannerFeed(abort.signal, () => {
        if (mounted.current) setWaiting(false);
        return fetchFeedComparison(symbol.trim().toUpperCase(), abort.signal);
      });
      if (mounted.current && !abort.signal.aborted) setResult(data);
    } catch (e) {
      if (mounted.current)
        setError(
          abort.signal.aborted
            ? 'Comparison cancelled. Run again when ready; no result was saved.'
            : e instanceof Error
              ? e.message
              : 'Comparison unavailable.'
        );
    } finally {
      if (controller.current === abort) controller.current = null;
      if (mounted.current) {
        setBusy(false);
        setWaiting(false);
        setNextCheck(Date.now() + 30_000);
      }
    }
  }
  const cooling = Boolean(now && now.getTime() < nextCheck);
  return (
    <section
      id="upstox-comparison"
      aria-label="Upstox comparison only"
      className="scanner-card"
    >
      <h2 className="text-lg font-semibold">Angel One ↔ Upstox comparison</h2>
      <p className="mt-2 text-sm text-sky-200">
        Verification only · temporary observations · no saved journal records
      </p>
      <p className="mt-2 text-sm text-slate-300">
        Compare one cash share and NIFTY spot. This panel does not qualify
        signals, replace Angel data, change fees, or complete the broker checks
        required for a paper entry.
      </p>
      <p className="mt-3 text-sm" role="status">
        {configured === null
          ? 'Upstox setup not confirmed.'
          : configured
            ? 'Token configured · a successful comparison is still required to test live access.'
            : 'Not connected · add the Upstox Analytics Token to Vercel.'}
      </p>
      {setupError && (
        <p className="mt-2 text-sm text-amber-200" role="alert">
          {setupError}
        </p>
      )}
      <button
        type="button"
        className="mt-2 text-xs text-sky-300 underline"
        onClick={() => void checkSetup()}
      >
        Check token setup
      </button>
      <details className="mt-3 rounded-lg border border-slate-700 p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Connect Upstox safely — account, token and Vercel steps
        </summary>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-slate-300">
          <li>
            If you do not have an Upstox account, start at{' '}
            <a
              className="text-sky-300 underline"
              href="https://upstox.com/trading-account/"
              target="_blank"
              rel="noreferrer"
            >
              Upstox account registration
            </a>
            . Complete any account approval and identity checks directly with
            Upstox and review its account terms. This app can stay disconnected
            while you do that.
          </li>
          <li>
            Sign in to{' '}
            <a
              className="text-sky-300 underline"
              href="https://account.upstox.com/developer/apps"
              target="_blank"
              rel="noreferrer"
            >
              Upstox Developer Apps
            </a>
            . Open Analytics → Generate Token → Confirm, then copy the full
            token. If you already use an Analytics Token elsewhere, reuse it;
            generating a new one can revoke the old one.
          </li>
          <li>
            Open{' '}
            <a
              className="text-sky-300 underline"
              href="https://vercel.com/kaushik-s-projects4/intraday-stock-tracker-india"
              target="_blank"
              rel="noreferrer"
            >
              this Vercel project
            </a>{' '}
            → Settings → Environment Variables. Add{' '}
            <code>UPSTOX_ANALYTICS_TOKEN</code>, select Secret and Production,
            paste the token, and save. Use Sensitive if your dashboard shows the
            older label. Do not add a NEXT_PUBLIC_ prefix.
          </li>
          <li>
            Redeploy the latest production version to apply the saved secret.
            Return here, refresh the app, and choose Check token setup. Token
            configured means it is present; Compare feeds tests whether it
            works.
          </li>
        </ol>
        <p className="mt-3 text-xs text-amber-200">
          Do not paste the token into chat, GitHub, journal notes or a browser
          field in this app. Keep it in Vercel only. Expired/revoked tokens must
          be replaced there, followed by a redeploy.
        </p>
        <p className="mt-2 text-xs">
          <a
            className="text-sky-300 underline"
            href="https://upstox.com/developer/api-documentation/analytics-token/"
            target="_blank"
            rel="noreferrer"
          >
            Official token guide
          </a>{' '}
          ·{' '}
          <a
            className="text-sky-300 underline"
            href="https://vercel.com/docs/environment-variables/managing-environment-variables"
            target="_blank"
            rel="noreferrer"
          >
            Vercel environment guide
          </a>
        </p>
      </details>
      <label className="mt-4 block text-sm">
        Nifty 50 share to compare
        <input
          value={symbol}
          maxLength={30}
          disabled={busy || scanBusy}
          autoCapitalize="characters"
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          onChange={(e) => {
            setSymbol(e.target.value.toUpperCase());
            setResult(null);
            setError('');
          }}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          className={button}
          disabled={
            !configured || busy || scanBusy || cooling || !symbol.trim() || !now
          }
          onClick={() => void compare()}
        >
          {busy
            ? waiting
              ? 'Waiting for candle access…'
              : 'Comparing feeds…'
            : 'Compare feeds'}
        </button>
        {busy && (
          <button
            type="button"
            className="text-sm text-amber-200 underline"
            onClick={() => controller.current?.abort()}
          >
            Cancel comparison
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        One manual check at a time, with a 30-second pause between checks. Keep
        this tab visible. No full-universe Upstox scan or automatic retries run.
      </p>
      {scanBusy && (
        <p className="mt-2 text-xs text-amber-200">
          Wait for the scanner to finish before starting a comparison.
        </p>
      )}
      {cooling && !busy && (
        <p className="mt-2 text-xs text-amber-200">
          Wait 30 seconds after the last check before trying again.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-amber-200" role="alert">
          {error}
        </p>
      )}
      {result && now && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-400">
            {result.symbol} + NIFTY · captured {displayTime(result.completedAt)}
            . These snapshots age; refresh does not save them.
          </p>
          {[result.symbol, 'NIFTY'].map((s) => {
            const a = result.angel,
              u = result.upstox,
              c = compareLatestCandles(
                a.candles[s] || [],
                u.candles[s] || [],
                now,
                s === 'NIFTY'
              );
            return (
              <article
                key={s}
                className="rounded-xl border border-slate-700 p-3"
              >
                <h3 className="font-semibold">
                  {s} · {c.status.replaceAll('_', ' ')}
                </h3>
                <p className="mt-2 text-sm text-amber-100">{c.message}</p>
                {(['angel', 'upstox'] as const).flatMap((provider) =>
                  (result[provider].errors[s] || []).map((e, i) => (
                    <p
                      key={`${provider}-${i}`}
                      className="mt-2 break-words text-xs text-amber-200"
                    >
                      {provider === 'angel' ? 'Angel One' : 'Upstox'}: {e}
                    </p>
                  ))
                )}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <caption className="mb-2 text-left text-slate-400">
                      Latest completed 5-minute candle · IST
                    </caption>
                    <thead>
                      <tr>
                        <th className="pr-2 py-1">Field</th>
                        <th className="pr-2">Angel One</th>
                        <th>Upstox</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th className="pr-2 py-2 font-normal">Bar start</th>
                        <td className="pr-2">{displayTime(c.angel?.time)}</td>
                        <td>{displayTime(c.upstox?.time)}</td>
                      </tr>
                      {c.fields.map((k) => (
                        <tr key={k}>
                          <th className="pr-2 py-1 font-normal capitalize">
                            {k}
                          </th>
                          <td className="pr-2">{number(c.angel?.[k])}</td>
                          <td>{number(c.upstox?.[k])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {s === 'NIFTY' && (
                  <p className="mt-2 text-xs text-slate-400">
                    Index volume and bid/ask are not used for candle matching.
                  </p>
                )}
                <div className="mt-3 grid gap-2">
                  <Quote name="Angel One" quote={a.quotes[s]} now={now} />
                  <Quote name="Upstox" quote={u.quotes[s]} now={now} />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Quotes are separate observations, not simultaneous ticks.
                  Compare their timestamps before interpreting a price
                  difference. Missing timestamps never count as fresh.
                </p>
              </article>
            );
          })}
          <p className="text-xs text-sky-200">
            Nothing here is saved as broker verification or a trade. Continue
            the existing independent Angel One comparison and exact charge
            checks in the journal. Both journals and the three-stock study are
            unchanged.
          </p>
        </div>
      )}
    </section>
  );
}
