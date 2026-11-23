'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Droplets, Gem, Layers3 } from 'lucide-react';
import AngelBudgetPanel from '@/components/AngelBudgetPanel';
import {
  COMMODITY_WATCH,
  commodityQuoteStatus,
  type CommodityWatchResponse,
} from '@/lib/commodityWatch';
const icons = [Droplets, Layers3, Gem];
const time = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' IST'
    : 'Not received';
export default function CommoditiesPage() {
  const [data, setData] = useState<CommodityWatchResponse | null>(null),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(0),
    [nextAt, setNextAt] = useState(0);
  const active = useRef<AbortController | null>(null),
    running = useRef(false),
    nextAllowed = useRef(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      active.current?.abort();
    };
  }, []);
  async function refresh() {
    if (running.current || Date.now() < nextAllowed.current) return;
    running.current = true;
    setBusy(true);
    setData(null);
    const controller = new AbortController();
    active.current = controller;
    nextAllowed.current = Date.now() + 30000;
    setNextAt(nextAllowed.current);
    try {
      const response = await fetch('/api/market/commodities', {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(55000),
        ]),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (
        result?.purpose !== 'watch-only' ||
        !Array.isArray(result.observations)
      )
        throw new Error('Unreadable response');
      setData(result);
      if (
        result.retryAfterMs > 0 &&
        Number.isSafeInteger(result.retryAfterMs)
      ) {
        nextAllowed.current = Date.now() + Math.max(30000, result.retryAfterMs);
        setNextAt(nextAllowed.current);
      }
    } catch {
      if (!controller.signal.aborted)
        setData({
          success: false,
          purpose: 'watch-only',
          checkedAt: new Date().toISOString(),
          error:
            'Unable to load commodity quotes. Earlier prices have been cleared; refresh later.',
          observations: [],
        });
    } finally {
      running.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const wait = Math.max(0, Math.ceil((nextAt - now) / 1000));
  return (
    <div className="space-y-6 pb-8">
      <section className="scanner-hero">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-200">
          MCX · watch only
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Commodities
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
          Watch crude oil, copper and gold through Angel One. Each card shows a
          standard futures contract with its own expiry.
        </p>
        <p className="mt-3 text-xs text-slate-400">
          Separate from the ₹50 Nifty 50 plan and three-stock study. No signals,
          orders or paper entries are created here.
        </p>
      </section>
      <section className="scanner-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Check the latest prices</h2>
            <p className="mt-1 text-xs text-slate-400">
              Manual snapshot · no automatic price polling
            </p>
          </div>
          <button
            type="button"
            className="scanner-primary inline-flex items-center gap-2"
            disabled={busy || !now || wait > 0}
            onClick={() => void refresh()}
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            {busy
              ? 'Checking Angel…'
              : wait > 0
                ? wait < 60
                  ? `Retry in ${wait}s`
                  : `Retry in ${Math.ceil(wait / 60)} min`
                : 'Refresh commodity prices'}
          </button>
        </div>
        {data?.error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-200"
          >
            {data.error}
          </p>
        )}
        <AngelBudgetPanel scanBusy={busy} />
      </section>
      <section
        className="grid gap-4 md:grid-cols-3"
        aria-label="Commodity price watch"
      >
        {COMMODITY_WATCH.map((commodity, i) => {
          const item = data?.observations.find(
              (o) => o.symbol === commodity.symbol
            ),
            Icon = icons[i];
          const status = item
            ? commodityQuoteStatus(item, now)
            : busy
              ? 'Checking…'
              : 'Not checked';
          return (
            <article key={commodity.symbol} className="scanner-card min-w-0">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-teal-400/10 p-2 text-teal-300">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold">{commodity.name}</h2>
                  <p className="text-xs text-slate-400">MCX standard futures</p>
                </div>
              </div>
              <p className="mt-6 text-3xl font-semibold tabular-nums">
                {item?.price
                  ? `₹${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Last traded price · {commodity.quoteUnit}
              </p>
              {item?.changePercent !== undefined && (
                <p
                  className={`mt-2 text-sm ${item.changePercent >= 0 ? 'text-teal-300' : 'text-rose-300'}`}
                >
                  {item.changePercent > 0 ? '+' : ''}
                  {item.changePercent.toFixed(2)}% from previous close
                </p>
              )}
              <p className="mt-4 break-words text-xs text-amber-200">
                {status}
              </p>
              <dl className="mt-5 space-y-3 border-t border-slate-700/60 pt-4 text-xs">
                <div>
                  <dt className="text-slate-400">Contract</dt>
                  <dd className="mt-1 break-all font-medium">
                    {item?.contract?.tradingSymbol ||
                      'Refresh to resolve current contract'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Expiry</dt>
                  <dd className="mt-1">
                    {item?.contract?.expiry || 'Not checked'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Exchange feed time</dt>
                  <dd className="mt-1">{time(item?.exchangeTime)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Last trade time</dt>
                  <dd className="mt-1">{time(item?.tradeTime)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Received by this app</dt>
                  <dd className="mt-1">{time(item?.receivedAt)}</dd>
                </div>
              </dl>
              <a
                href={commodity.link}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-block text-xs text-teal-300 underline"
              >
                MCX product details ↗
              </a>
            </article>
          );
        })}
      </section>
      <section className="scanner-card text-sm leading-relaxed text-slate-300">
        <h2 className="font-semibold text-white">How to verify</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            Press Refresh commodity prices. The three contracts are requested
            together using the shared Angel allowance.
          </li>
          <li>
            In Angel One, open the exact MCX contract shown on the card,
            including its expiry.
          </li>
          <li>
            Compare the price and exchange time. A stale or missing timestamp is
            not a verified current price.
          </li>
        </ol>
        <p className="mt-4 text-xs text-slate-400">
          We select the nearest listed expiry after today; expiry-day contracts
          are skipped. The selected contract may change on rollover and is not
          necessarily the most active. MCX sessions differ from NSE sessions. A
          quoted price is not the cost or margin for one lot. No ₹50
          affordability or entry test is performed.
        </p>
        <Link
          href="/market"
          className="mt-4 inline-block text-sm text-teal-300 underline"
        >
          Return to the stock scanner
        </Link>
      </section>
    </div>
  );
}
