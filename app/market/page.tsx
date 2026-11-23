'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getIndianMarketStatus,
  isFreshSignalWindowOpenIST,
  istDateKey,
} from '@/lib/marketHours';
import {
  rankShortlist,
  type ScanConfig,
  type ScanResult,
} from '@/lib/niftyScanner';
import {
  DEFAULT_SCAN_CONFIG_3R as DEFAULT_SCAN_CONFIG,
  SCANNER_3R_SCREEN_VERSION as SCANNER_VERSION,
  screenScanner3R as screenCandidate,
  validateScanConfig3R as validateScanConfig,
} from '@/lib/scanner3R';
import {
  fetchScannerData,
  loadScannerUniverse,
  type ScanProgress,
  type ScannerData,
} from '@/lib/scannerFeed';
import ScannerJournal from '@/components/ScannerJournal';
import ScannerMondayChecklist from '@/components/ScannerMondayChecklist';
import type { NiftyUniverse } from '@/lib/nifty50';
import { CHARGE_SCHEDULE } from '@/lib/brokerCharges';
import { displayTime } from '@/components/DataStatusPanel';
const card = 'rounded-2xl border border-slate-700 bg-slate-900/60 p-4';
const input =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white';
const button =
  'rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold disabled:opacity-40';
const money = (n: number) => `₹${n.toFixed(2)}`;
type Snapshot = {
  universe: NiftyUniverse;
  data: ScannerData;
  startedAt: string;
  config: ScanConfig;
};
const labels: Record<ScanResult['status'], string> = {
  SHORTLIST: 'Fits estimated budget',
  WATCH: 'Watch / does not fit',
  UNAVAILABLE: 'Data unavailable / stale',
  CLOSED: 'Outside entry window',
};
export default function MarketPage() {
  const [values, setValues] = useState(
    Object.fromEntries(
      Object.entries(DEFAULT_SCAN_CONFIG).map(([k, v]) => [k, String(v)])
    )
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState<ScanProgress | null>(null),
    [now, setNow] = useState<Date | null>(null),
    [auto, setAuto] = useState(false),
    [selected, setSelected] = useState('');
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(false);
  const config = useMemo(() => {
    try {
      if (Object.values(values).some((v) => !v.trim()))
        throw new Error('Complete every budget and cost field.');
      const parsed = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, Number(v)])
      ) as ScanConfig;
      validateScanConfig(parsed);
      return { value: parsed, error: '' };
    } catch (e) {
      return {
        value: undefined,
        error: e instanceof Error ? e.message : 'Invalid settings.',
      };
    }
  }, [values]);
  useEffect(() => {
    mounted.current = true;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 5000);
    const hide = () => {
      if (document.hidden) controller.current?.abort();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  const run = useCallback(
    async (symbol?: string) => {
      if (controller.current || !config.value || document.hidden) return;
      const abort = new AbortController();
      controller.current = abort;
      setBusy(true);
      setError('');
      setProgress(null);
      const previous = snapshot,
        startedAt = new Date().toISOString();
      if (!symbol) setSnapshot(null);
      try {
        const universe = await loadScannerUniverse(abort.signal);
        if (symbol && !universe.members.some((m) => m.symbol === symbol))
          throw new Error(
            'This symbol is no longer in the verified Nifty 50 list. Run a full scan.'
          );
        const symbols = symbol
          ? [symbol]
          : universe.members.map((m) => m.symbol);
        const result = await fetchScannerData(symbols, abort.signal, (p) => {
          if (mounted.current) setProgress(p);
        });
        abort.signal.throwIfAborted();
        // A one-share recheck retains other snapshots; freshness is still evaluated for each row.
        const sameUniverse =
          previous &&
          JSON.stringify(previous.universe.members.map((m) => m.symbol)) ===
            JSON.stringify(universe.members.map((m) => m.symbol));
        const data =
          symbol && sameUniverse
            ? {
                ...result,
                quotes: { ...previous.data.quotes, ...result.quotes },
                candles: { ...previous.data.candles, ...result.candles },
                errors: { ...previous.data.errors, ...result.errors },
              }
            : result;
        if (symbol && sameUniverse) {
          delete data.quotes[symbol];
          if (result.quotes[symbol])
            data.quotes[symbol] = result.quotes[symbol];
          delete data.errors[symbol];
          delete data.errors.NIFTY;
          if (result.errors[symbol])
            data.errors[symbol] = result.errors[symbol];
          if (result.errors.NIFTY) data.errors.NIFTY = result.errors.NIFTY;
        }
        if (mounted.current) {
          setSnapshot({
            universe,
            data,
            startedAt,
            config: { ...config.value },
          });
          setNow(new Date());
        }
      } catch (e) {
        if (mounted.current) {
          const message = abort.signal.aborted
            ? 'Scan cancelled or paused when the tab was hidden. Run again when ready.'
            : e instanceof Error
              ? e.message
              : 'Scan failed.';
          setError(
            symbol
              ? `${symbol} recheck failed. ${message} Previous results remain for reference; recheck again before entry.`
              : message
          );
          if (symbol && previous) {
            // Keep context for retry, but invalidate the failed share AND the unverified index.
            const quotes = { ...previous.data.quotes };
            delete quotes[symbol];
            setSnapshot({
              ...previous,
              data: {
                ...previous.data,
                quotes,
                candles: { ...previous.data.candles, [symbol]: [], NIFTY: [] },
                errors: {
                  ...previous.data.errors,
                  [symbol]: [message],
                  NIFTY: [
                    'Latest recheck failed; index confirmation must be refreshed.',
                  ],
                },
              },
            });
            setNow(new Date());
          }
        }
      } finally {
        if (controller.current === abort) controller.current = null;
        if (mounted.current) setBusy(false);
      }
    },
    [config, snapshot]
  );
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && isFreshSignalWindowOpenIST()) void run();
    }, 300_000);
    return () => window.clearInterval(timer);
  }, [auto, run]);
  const results = useMemo(() => {
    if (!snapshot || !now) return [];
    return snapshot.universe.members.map((m) =>
      screenCandidate(
        m.symbol,
        snapshot.data.quotes[m.symbol],
        snapshot.data.candles[m.symbol] || [],
        snapshot.data.candles.NIFTY || [],
        snapshot.config,
        now,
        [
          ...(busy
            ? ['Recheck in progress. Previous results are for reference only.']
            : []),
          ...(snapshot.universe.asOf !== istDateKey(now)
            ? [
                'Universe verification belongs to an earlier day. Run a new scan.',
              ]
            : []),
          ...(snapshot.data.errors[m.symbol] || []),
          ...(snapshot.data.errors.NIFTY || []).map((e) => `NIFTY: ${e}`),
        ]
      )
    );
  }, [snapshot, now, busy]);
  const shortlist = rankShortlist(results),
    unavailable = results.filter((r) => r.status === 'UNAVAILABLE').length;
  function exportScan() {
    if (!snapshot) return;
    const text = JSON.stringify(
      {
        version: SCANNER_VERSION,
        purpose: 'exploratory-screen-only',
        ...snapshot,
        results,
        evaluatedAt: now?.toISOString(),
      },
      null,
      2
    );
    const url = URL.createObjectURL(
      new Blob([text], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `nifty50-scan-${istDateKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function detail(r: ScanResult) {
    return (
      <>
        <p className="mt-2 text-xs text-slate-400">
          Exchange {displayTime(r.exchangeTime)} · candle start{' '}
          {displayTime(r.candleTime)}
        </p>
        {r.setup && (
          <p className="mt-2 text-sm">
            Trigger {money(r.setup.entry)} · stop {money(r.setup.stop)} · target{' '}
            {money(r.setup.target)}
          </p>
        )}
        {r.plan && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-3 text-xs">
            <p>
              Observed ask <strong>{money(r.plan.entry)}</strong>
            </p>
            <p>
              Quantity <strong>{r.plan.quantity}</strong>
            </p>
            <p>
              Total planned risk <strong>{money(r.plan.risk)}</strong>
            </p>
            <p>
              Net target reward <strong>{money(r.plan.reward)}</strong>
            </p>
            <p>
              Net reward/risk <strong>{r.plan.netRR.toFixed(3)}</strong>
            </p>
            <p>
              Cash with costs <strong>{money(r.plan.cashRequired)}</strong>
            </p>
            <p>Fees at stop {money(r.plan.atStop.total)}</p>
            <p>Fees at target {money(r.plan.atTarget.total)}</p>
            <p className="col-span-2">
              Planning fees + rounding / extra charges{' '}
              {money(r.plan.planningCharges)}; slippage{' '}
              {money(snapshot?.config.slippage || 0)} separately included.
            </p>
          </div>
        )}
        {r.reasons.map((reason) => (
          <p key={reason} className="mt-2 text-sm text-amber-200">
            {reason}
          </p>
        ))}
        {r.status === 'SHORTLIST' && (
          <p className="mt-3 text-xs text-amber-200">
            Broker price/candle comparison, exact account charges and event
            review still required. This is an estimated screen result, not a
            trade approval.
          </p>
        )}
        <button
          className="mt-3 text-sm text-teal-300 underline disabled:opacity-40"
          disabled={busy || !now}
          onClick={() => void run(r.symbol)}
        >
          Recheck {r.symbol}
        </button>
        <a
          href="#scanner-journal"
          className="ml-4 text-sm text-teal-300 underline"
          onClick={() => setSelected(r.symbol)}
        >
          Review paper entry
        </a>
      </>
    );
  }
  return (
    <div className="space-y-5 pb-12">
      <header>
        <p className="text-xs uppercase tracking-widest text-teal-300">
          Separate 3R paper version
        </p>
        <h1 className="mt-2 text-3xl font-bold">Nifty 50 scanner · 3R</h1>
        <p className="mt-3 text-sm text-slate-300">
          Find cash-share setups that fit up to ₹50 total planned risk after
          full charges and execution reserves. New entries use
          scanner-cash-3r-v2; the three-stock study and old 2R records keep
          their original rules.
        </p>
      </header>
      <section
        id="scanner-demo"
        className={`${card} scroll-mt-6 border-indigo-700`}
      >
        <h2 className="font-semibold">Practise first: ONGC demo mode</h2>
        <p className="mt-2 text-sm text-slate-300">
          Walk through fictional data verification, charges and a 3R entry.
          Practise stop-loss, target-hit and 30-minute time exits. Demo progress
          stays in memory; neither journal nor your three-stock study is
          changed. Use it when you have no open paper position to supervise.
        </p>
        <Link
          href="/market/demo"
          className="mt-3 inline-block rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold"
        >
          Open ONGC practice demo
        </Link>
      </section>
      <section className={card}>
        <h2 className="font-semibold">Your three-share study stays separate</h2>
        <p className="mt-2 text-sm text-slate-400">
          Scanner trades use their own paper journal below and never add to the
          study’s 100-trade / 50-session results. Continue the fixed study in{' '}
          <Link href="/signals" className="text-teal-300 underline">
            Practice
          </Link>
          . Scanner candidates outside that list are exploratory observations.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          The shortlist uses the entered scenario. Before a paper entry, the
          scanner journal applies the remaining combined cash and loss limits
          across both journals. Study shares can only be entered in Practice.
        </p>
      </section>
      <ScannerMondayChecklist hasCandidate={Boolean(selected)} />
      <section id="scanner-budget" className={`${card} scroll-mt-6`}>
        <h2 className="font-semibold">Budget and cost assumptions</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {Object.keys(DEFAULT_SCAN_CONFIG).map((key) => (
            <label className="text-xs" key={key}>
              {
                {
                  riskBudget: 'Total risk budget (₹, max 50)',
                  cash: 'Available cash (₹, max 9500)',
                  slippage: 'Execution reserve floor (₹, min 5)',
                  roundingReserve: 'Tax-rounding reserve (₹, min 1)',
                  extraCharges: 'Extra round-trip charges (₹)',
                }[key]
              }
              <input
                className={input}
                type="number"
                min={key === 'slippage' ? 5 : key === 'roundingReserve' ? 1 : 0}
                step="0.01"
                disabled={busy}
                value={values[key]}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [key]: e.target.value }));
                  setSnapshot(null);
                }}
              />
            </label>
          ))}
        </div>
        {config.error && (
          <p role="alert" className="mt-3 text-amber-200">
            {config.error}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          One buy and one sell order, no leverage. Standard{' '}
          <a
            href={CHARGE_SCHEDULE.source}
            target="_blank"
            rel="noreferrer"
            className="text-teal-300 underline"
          >
            Angel One published charges
          </a>{' '}
          checked {CHARGE_SCHEDULE.reviewedAt}; your account costs remain
          unverified. Keep realistic reserves. A valid result may contain zero
          candidates.
        </p>
      </section>
      <section className={card}>
        <h2 className="font-semibold">Cost headroom</h2>
        <p className="mt-2 text-sm text-slate-300">
          At a 3R price target, this budget permits total costs and reserves of
          at most {money(((config.value?.riskBudget || 0) * 1.8) / 4)} to meet
          net reward/risk 1.2 when the whole risk budget can be used. Whole
          shares, a later ask and the chart can reduce that allowance.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Each quantity uses the largest of your execution reserve, ₹5, two
          spreads × quantity and two ticks × quantity. Tax rounding stays at
          least ₹1. Purchase value is capped at ₹5,000; cash and all costs must
          fit ₹9,500. Costs stay inside the ₹50 planned-risk cap. Targets remain
          3× the original chart stop distance; no chasing or moving the target.
        </p>
        <p className="mt-2 text-xs text-amber-200">
          One 3R entry per day across the shared account. No leverage or broker
          orders. Zero candidates is valid. Refresh other open app tabs before
          saving; old scanner versions cannot write the new backup format.
        </p>
        <Link
          href="/cash-plan"
          className="mt-3 inline-block text-sm text-teal-300 underline"
        >
          Read the active 3R rules and cost examples
        </Link>
      </section>
      <section id="scanner-run" className={`${card} scroll-mt-6`}>
        <p className="text-sm">
          {now
            ? getIndianMarketStatus(now).replaceAll('_', ' ')
            : 'Checking session…'}{' '}
          · shortlist window 09:45–11:15 IST
        </p>
        <p className="mt-2 text-xs text-slate-400">
          A full scan loads all 50 shares in paced batches, then refreshes
          quotes. Allow a few minutes and keep this tab visible. Recheck a
          candidate before reviewing it: quotes expire after 30 seconds, and
          results update as they age.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className={button}
            disabled={busy || !config.value}
            onClick={() => void run()}
          >
            {busy
              ? 'Scanning…'
              : now && isFreshSignalWindowOpenIST(now)
                ? 'Scan Nifty 50'
                : 'Check Nifty 50 feeds'}
          </button>
          {busy && (
            <button
              className="text-sm text-amber-200 underline"
              onClick={() => controller.current?.abort()}
            >
              Cancel scan
            </button>
          )}
          <button
            className="text-sm text-teal-300 underline disabled:opacity-40"
            disabled={!snapshot || busy}
            onClick={exportScan}
          >
            Export scan snapshot
          </button>
        </div>
        <label className="mt-3 flex gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              if (e.target.checked && isFreshSignalWindowOpenIST()) void run();
            }}
          />
          Repeat full scan five minutes after completion while visible in the
          entry window
        </label>
        {progress && (
          <p role="status" className="mt-3 text-sm">
            {progress.stage === 'CANDLES' ? 'Candle history' : 'Fresh quotes'}:{' '}
            {progress.done} / {progress.total}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-amber-200">
            {error}
          </p>
        )}
        {snapshot && (
          <p className="mt-3 text-xs text-slate-400">
            50 official constituents verified{' '}
            {displayTime(snapshot.universe.checkedAt)} ·{' '}
            <a
              className="underline"
              href={snapshot.universe.source}
              target="_blank"
              rel="noreferrer"
            >
              source CSV
            </a>
            . Last fetch completed {displayTime(snapshot.data.completedAt)}.{' '}
            Rechecks refresh one stock and NIFTY only; other rows keep their
            original timestamps.
          </p>
        )}
      </section>
      <section className="space-y-3" aria-label="Scanner shortlist">
        <h2 className="text-lg font-semibold">
          Shortlist · {shortlist.length}
        </h2>
        <p className="text-xs text-slate-400">
          Sorted by estimated net reward/risk, then tighter spread. These are
          not win probabilities. Showing up to five; all results are below.
        </p>
        {!snapshot ? (
          <p className={card}>
            {busy
              ? 'Building the scan; no candidates are approved while it is incomplete.'
              : 'Run a scan to evaluate the current official Nifty 50 list.'}
          </p>
        ) : !shortlist.length ? (
          <p className={card}>
            {now && !isFreshSignalWindowOpenIST(now)
              ? 'Outside the entry window. This is a feed check only.'
              : unavailable === 50
                ? 'All results have missing or stale data. Refresh before drawing conclusions.'
                : 'No currently qualified candidate under these assumptions. Review exclusions below.'}
          </p>
        ) : (
          shortlist.slice(0, 5).map((r) => (
            <article
              key={r.symbol}
              className="rounded-2xl border border-teal-800 bg-teal-950/20 p-4"
            >
              <h3 className="font-bold">{r.symbol} · fits estimated budget</h3>
              <p className="mt-1 text-xs text-slate-400">
                {
                  snapshot.universe.members.find((m) => m.symbol === r.symbol)
                    ?.name
                }
              </p>
              {detail(r)}
            </article>
          ))
        )}
      </section>
      {snapshot && (
        <details className={card}>
          <summary className="cursor-pointer font-semibold">
            All 50 results · {unavailable} unavailable / stale
          </summary>
          <div className="mt-3 space-y-3">
            {results.map((r) => (
              <details
                className="border-t border-slate-800 pt-3"
                key={r.symbol}
              >
                <summary className="cursor-pointer text-sm">
                  {r.symbol} · {labels[r.status]}
                </summary>
                {detail(r)}
              </details>
            ))}
          </div>
        </details>
      )}
      <ScannerJournal
        selected={selected}
        context={
          snapshot && selected ? { ...snapshot, symbol: selected } : null
        }
        now={now}
        scanBusy={busy}
        recheck={() => void run(selected)}
      />
      <p className="text-xs text-slate-500">
        Market data and membership failures are shown explicitly. No bullish or
        bearish score is substituted for the fixed setup. Exported scans remain
        separate from study backups. No scanner orders or paper fills are
        recorded automatically.
      </p>
    </div>
  );
}
