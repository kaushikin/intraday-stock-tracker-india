'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Gem, RefreshCw, ShieldCheck, Bell, Download } from 'lucide-react';
import AngelBudgetPanel from '@/components/AngelBudgetPanel';
import GoldPetalBackgroundAlerts from '@/components/GoldPetalBackgroundAlerts';
import { useGoldPetalBook } from '@/hooks/useGoldPetalBook';
import { istDateKey } from '@/lib/marketHours';
import {
  GOLD_PETAL_SPEC,
  MCX_CALENDAR,
  petalQuoteProblem,
  type PetalFeed,
} from '@/lib/goldPetalMarket';
import {
  PETAL_RULES,
  PETAL_FEES,
  PETAL_BOOK_KEY,
  planPetal,
  petalBudget,
  petalEquity,
  verificationProblems,
  openPetal,
  closePetal,
  closePetalFromQuote,
  petalExitAlert,
  petalCharges,
  type PetalVerification,
  type PetalExitReason,
} from '@/lib/goldPetalPilot';
const cash = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stamp = (s?: string) =>
  s
    ? new Date(s).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
      }) + ' IST'
    : 'Not available';
const inputClass =
  'mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white';
const blank = {
  contract: '',
  barTime: '',
  barClose: '',
  brokerPrice: '',
  brokerTime: '',
  feeAtStop: '',
  feeAtTarget: '',
  reference: '',
  sessionConfirmed: false,
  eventChecked: false,
};
const isoIST = (s: string) =>
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)
    ? new Date(
        s.replace(' ', 'T') + (s.length === 16 ? ':00' : '') + '+05:30'
      ).toISOString()
    : '';
export default function GoldPetalPage() {
  const { book, other, ready, otherReady, error, transact } =
    useGoldPetalBook();
  const [now, setNow] = useState(0),
    [feed, setFeed] = useState<PetalFeed | null>(null),
    [busy, setBusy] = useState(false),
    [monitoring, setMonitoring] = useState(false),
    [nextAt, setNextAt] = useState(0),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false),
    [declaration, setDeclaration] = useState(''),
    [fields, setFields] = useState(blank),
    [exitPrice, setExitPrice] = useState(''),
    [exitFees, setExitFees] = useState(''),
    [exitReference, setExitReference] = useState(''),
    [exitSnapshot, setExitSnapshot] = useState<PetalFeed | null>(null),
    [exitReason, setExitReason] = useState<PetalExitReason>('MANUAL');
  const pending = useRef(false),
    controller = useRef<AbortController | null>(null),
    nextAllowed = useRef(0),
    activeSymbol = useRef<string | undefined>(),
    feedRef = useRef<PetalFeed | null>(null),
    flagging = useRef(false);
  const open = book.positions.find((p) => !p.exit);
  activeSymbol.current = open?.feed.contract?.symbol;
  feedRef.current = feed;
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const hide = () => {
      if (document.hidden) {
        setMonitoring(false);
        controller.current?.abort();
        setFeed(null);
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hide);
      controller.current?.abort();
    };
  }, []);
  async function refresh() {
    if (pending.current || Date.now() < nextAllowed.current || document.hidden)
      return;
    pending.current = true;
    setBusy(true);
    setFeed(null);
    nextAllowed.current = Date.now() + 30000;
    setNextAt(nextAllowed.current);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch('/api/market/gold-petal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          activeSymbol.current ? { contract: activeSymbol.current } : {}
        ),
        cache: 'no-store',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(55000)]),
      });
      const result = await response.json();
      if (abort.signal.aborted) return;
      if (
        result?.kind !== 'GOLD_PETAL_PAPER' ||
        !Array.isArray(result.candles) ||
        !Array.isArray(result.errors)
      )
        throw new Error('Unreadable Gold Petal response.');
      if (
        Number.isSafeInteger(result.retryAfterMs) &&
        result.retryAfterMs > 0
      ) {
        nextAllowed.current = Date.now() + Math.max(30000, result.retryAfterMs);
        setNextAt(nextAllowed.current);
      }
      setFeed(result);
    } catch {
      if (!abort.signal.aborted)
        setMessage(
          'Gold Petal data request failed. Previous prices were cleared; entries are blocked.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!monitoring) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () =>
      clearInterval(
        timer
      ); /* Read current contract through the ref; monitoring does not restart on every quote. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoring]);
  const current = new Date(now || 0),
    budget = petalBudget(book, other, current),
    equity = petalEquity(book);
  const result =
    feed && now
      ? planPetal(feed, current, {
          stop: Number(fields.feeAtStop) || 0,
          target: Number(fields.feeAtTarget) || 0,
        })
      : {
          issues: ['Refresh Gold Petal to evaluate a completed-candle setup.'],
          plan: undefined,
        };
  const plan = result.plan,
    last = feed?.candles.at(-1),
    q = feed?.quote,
    quoteIssue = petalQuoteProblem(q, current);
  let verification: PetalVerification;
  try {
    verification = {
      contract: fields.contract.trim().toUpperCase(),
      barTime: isoIST(fields.barTime),
      barClose: Number(fields.barClose),
      brokerPrice: Number(fields.brokerPrice),
      brokerTime: isoIST(fields.brokerTime),
      feeAtStop: Number(fields.feeAtStop),
      feeAtTarget: Number(fields.feeAtTarget),
      reference: fields.reference,
      sessionConfirmed: fields.sessionConfirmed,
      eventChecked: fields.eventChecked,
    };
  } catch {
    verification = {
      ...blank,
      barTime: '',
      barClose: 0,
      brokerPrice: 0,
      brokerTime: '',
      feeAtStop: 0,
      feeAtTarget: 0,
    };
  }
  const checks =
    plan && feed ? verificationProblems(verification, feed, plan, current) : [];
  const entryIssues = [
    ...result.issues,
    ...checks,
    ...(!ready || !otherReady
      ? ['Storage checks must pass before an entry.']
      : []),
    ...(!budget.declared
      ? ['Declare other trading losses and open risk for today.']
      : []),
    ...(!monitoring
      ? ['Start on-screen checks before recording an entry.']
      : []),
    ...(other.openCount ? ['An existing stock paper position is open.'] : []),
    ...(open ? ['A Gold Petal paper position is already open.'] : []),
    ...(book.positions.some(
      (p) => istDateKey(new Date(p.enteredAt)) === istDateKey(current)
    )
      ? ['One pilot entry per IST day is the limit.']
      : []),
    ...(plan && plan.plannedRisk > budget.remaining
      ? ['The remaining daily allowance is too small.']
      : []),
    ...(plan && plan.fullFunding > equity
      ? ['Full funding exceeds current pilot equity.']
      : []),
  ];
  const alert = open ? petalExitAlert(open, feed, budget.used, current) : null;
  useEffect(() => {
    if (
      !ready ||
      !open ||
      open.alert ||
      !alert?.reason ||
      flagging.current ||
      !now
    )
      return;
    flagging.current = true;
    const id = open.id,
      reason = alert.reason;
    void transact((b) => ({
      ...b,
      positions: b.positions.map((p) =>
        p.id === id && !p.exit && !p.alert
          ? { ...p, alert: { reason, at: new Date().toISOString() } }
          : p
      ),
    }))
      .catch((e) => setMessage(e.message))
      .finally(() => {
        flagging.current = false;
      });
  }, [ready, open, alert?.reason, now, transact]);
  async function save(action: () => Promise<void>) {
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Save failed; no record was changed.'
      );
    } finally {
      setSaving(false);
    }
  }
  const field = (key: keyof typeof blank, label: string, placeholder = '') => (
    <label className="block text-xs text-slate-300">
      {label}
      <input
        className={inputClass}
        value={String(fields[key])}
        placeholder={placeholder}
        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );
  const wait = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const closed = book.positions.filter((p) => p.exit);
  function download() {
    const raw = localStorage.getItem(PETAL_BOOK_KEY) || JSON.stringify(book);
    const url = URL.createObjectURL(
      new Blob([raw], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `gold-petal-paper-${istDateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-5 pb-8">
      <section className="scanner-hero">
        <Link href="/commodities" className="text-xs text-teal-200 underline">
          ← Commodity watch
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <Gem className="h-7 w-7 text-amber-200" />
          <h1 className="text-3xl font-semibold tracking-tight">
            Gold Petal paper pilot
          </h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
          One gram. One paper trade a day. Full exposure funded from ₹30,000,
          with ₹150 trade risk and a ₹250 total daily loss allowance.
        </p>
        <p className="mt-3 text-xs text-amber-200">
          Research only · budget feasibility can pass; strategy profitability is
          unproven. No broker orders.
        </p>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Gold Petal paper limits"
      >
        {[
          ['Pilot paper equity', cash(equity)],
          ['Maximum trade risk', '₹150 incl. costs'],
          [
            'Daily allowance unreserved',
            ready && otherReady && budget.declared
              ? cash(budget.remaining)
              : 'Not verified',
          ],
        ].map(([label, value]) => (
          <div key={label} className="scanner-card">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>
      {(message || error) && (
        <p
          role="alert"
          className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-sm text-amber-200"
        >
          {message} {error}
        </p>
      )}

      <section id="gold-petal-daily-risk" className="scanner-card scroll-mt-6 space-y-4">
        <h2 className="font-semibold">1 · Confirm today’s total risk</h2>
        <p className="text-sm text-slate-300">
          Both stock paper journals are read here without changing them. Today’s
          losing trades use the allowance; profits do not refill it. Open
          positions reserve their planned risk.
        </p>
        <p className="text-xs text-slate-400">
          Known stock losses: {otherReady ? cash(other.loss) : 'unknown'} ·
          stock open risk: {otherReady ? cash(other.openRisk) : 'unknown'} ·
          pilot reserved: {cash(budget.reserved)}
        </p>
        <label className="block text-sm">
          Other losses + open risk today, outside these paper records (₹)
          <input
            aria-label="Other losses and open risk"
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={declaration}
            placeholder="Enter 0 only if none"
            onChange={(e) => setDeclaration(e.target.value)}
          />
        </label>
        <button
          className="scanner-secondary"
          disabled={!ready || saving || declaration.trim() === ''}
          onClick={() =>
            void save(() =>
              transact((b) => {
                const amount = Number(declaration),
                  day = istDateKey(new Date());
                if (!Number.isFinite(amount) || amount < 0)
                  throw new Error('Enter a non-negative amount.');
                return {
                  ...b,
                  declarations: {
                    ...b.declarations,
                    [day]: {
                      amount: Math.max(
                        amount,
                        b.declarations[day]?.amount || 0
                      ),
                      at: new Date().toISOString(),
                    },
                  },
                };
              })
            )
          }
        >
          Confirm today’s outside risk
        </button>
        <p className="text-xs leading-relaxed text-slate-400">
          Confirmed outside risk:{' '}
          {budget.declared
            ? cash(book.declarations[istDateKey(current)].amount)
            : 'not declared'}
          . It cannot be reduced during the day. The ₹250 gate applies to pilot
          entries using this browser’s records and your declaration. It cannot
          block trades in other pages, devices or your broker. Avoid other
          trading while this pilot is open. A stop or alert cannot guarantee a
          realised loss cap.
        </p>
      </section>

      <GoldPetalBackgroundAlerts feeFloor={{ stop: Number(fields.feeAtStop) || 0, target: Number(fields.feeAtTarget) || 0 }} />

      <section className="scanner-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">2 · Check the contract and data</h2>
          <div className="flex flex-wrap gap-2">
            <button
              className="scanner-secondary inline-flex items-center gap-2"
              disabled={busy || !now || wait > 0}
              onClick={() => void refresh()}
            >
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              {busy
                ? 'Checking…'
                : wait
                  ? `Wait ${wait}s`
                  : 'Refresh Gold Petal'}
            </button>
            <button
              className="scanner-primary"
              onClick={() => setMonitoring((m) => !m)}
            >
              {monitoring ? 'Pause on-screen checks' : 'Start on-screen checks'}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {monitoring
            ? 'Checking about every 30 seconds while this page is visible.'
            : 'Monitoring paused.'}{' '}
          Checks use the shared Angel allowance. Hidden tabs pause checks;
          closing the app stops these on-screen checks and exit alerts. The separate background candidate watch above can continue when enabled.
        </p>
        <AngelBudgetPanel scanBusy={busy} />
        {feed?.errors.map((e, i) => (
          <p key={i} role="alert" className="text-sm text-amber-200">
            {e}
          </p>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-400">
              Exact MCX contract · 1 gram per lot
            </p>
            <p className="mt-1 break-all font-semibold">
              {feed?.contract?.symbol || 'Not checked'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Expiry: {feed?.contract?.expiry || '—'} · no entries within 10
              calendar days of expiry
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">
              Last traded / bid / ask · ₹ per gram
            </p>
            <p className="mt-1 text-lg font-semibold">
              {q ? `${cash(q.price)} / ${cash(q.bid)} / ${cash(q.ask)}` : '—'}
            </p>
            <p className="mt-1 text-xs text-amber-200">
              {quoteIssue || 'Recent timestamps · compare with Angel One'}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Exchange: {stamp(q?.exchangeTime)} · last trade: {stamp(q?.tradeTime)}{' '}
          · received: {stamp(q?.receivedAt)}
        </p>
        <div className="rounded-xl bg-slate-950/50 p-4 text-sm">
          <p>
            Latest completed 5-minute bar starts:{' '}
            <strong>{stamp(last?.time)}</strong>
          </p>
          <p className="mt-2">
            {last
              ? `O ${last.open} · H ${last.high} · L ${last.low} · C ${last.close} · volume ${last.volume}`
              : 'No completed candle available.'}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {feed?.candles.length || 0} completed same-session bars. Match OHLC
            and volume in Angel; the forming candle is excluded.
          </p>
        </div>
      </section>

      {!open && (
        <section className="scanner-card space-y-4">
          <h2 className="font-semibold">3 · Review the paper setup</h2>
          <p
            className={`text-sm font-medium ${result.issues.length ? 'text-amber-200' : 'text-teal-200'}`}
          >
            {result.issues.length
              ? 'WAIT · no qualifying paper entry'
              : 'Paper setup fits the model · complete verification before entry'}
          </p>
          {result.issues.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              {result.issues.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {plan && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['Paper buy (ask + ₹5)', plan.entry],
                ['Structural stop', plan.stop],
                ['Target (≥2R after costs)', plan.target],
                ['Total risk incl. costs', plan.plannedRisk],
                ['Full funding + reserve', plan.fullFunding],
                ['Mean true range · 14 bars', plan.atr],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-slate-950/50 p-3">
                  <p className="text-xs text-slate-400">{l}</p>
                  <p className="mt-1 font-semibold">{cash(Number(v))}</p>
                </div>
              ))}
            </div>
          )}
          <details open={!!plan && !result.issues.length}>
            <summary className="cursor-pointer text-sm font-medium text-teal-200">
              Verify in Angel One and check the full charges
            </summary>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Open the exact expiry above. Match all displayed OHLC and volume
              values, then enter the completed bar’s start time and close.
              Finally enter the current Angel price and time. Times below are
              IST. A new bar or stale quote blocks entry until rechecked.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {field('contract', 'Exact Angel contract', 'GOLDPETAL…FUT')}
              {field(
                'barTime',
                'Completed bar start · IST',
                '2026-11-23 19:30'
              )}
              {field('barClose', 'Completed bar close', '₹ per gram')}
              {field('brokerPrice', 'Angel last traded price', '₹ per gram')}
              {field(
                'brokerTime',
                'Angel observed quote time · IST',
                '2026-11-23 19:35:10'
              )}
            </div>
            {plan && (
              <p className="mt-4 text-sm text-slate-300">
                Model round-trip fees at stop:{' '}
                {cash(petalCharges(plan.entry, plan.stop - 5).total)}; at
                target: {cash(petalCharges(plan.entry, plan.target - 5).total)}.
                Risk also reserves ₹5 exit slippage and ₹2 rounding; ₹5 entry
                slippage is already in the paper buy price.
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {field('feeAtStop', 'Angel full round-trip fees at stop (₹)')}
              {field('feeAtTarget', 'Angel full round-trip fees at target (₹)')}
              {field(
                'reference',
                'Fee source / verification note',
                'Angel calculator / account tariff, checked today'
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Normal brokerage ₹20 per order, MCX fees, CTT, SEBI fee, stamp
              duty and GST are included. Higher verified costs increase risk;
              lower fees never override the published model. A target can adjust
              after higher costs—verify it again.
            </p>
            <label className="mt-4 flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={fields.sessionConfirmed}
                onChange={(e) =>
                  setFields((f) => ({
                    ...f,
                    sessionConfirmed: e.target.checked,
                  }))
                }
              />
              I matched the contract, all candle values and volume, and checked
              MCX session and tender dates.
            </label>
            <label className="mt-3 flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={fields.eventChecked}
                onChange={(e) =>
                  setFields((f) => ({ ...f, eventChecked: e.target.checked }))
                }
              />
              I checked the economic calendar: no major scheduled gold/USD event
              during this 30-minute paper trade.
            </label>
          </details>
          <div className="rounded-xl border border-slate-700 p-4">
            <p className="text-sm font-medium">
              {entryIssues.length
                ? 'Entry checks remaining'
                : 'Ready to record one paper entry'}
            </p>
            {entryIssues.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-400">
                {entryIssues
                  .filter((s) => !result.issues.includes(s))
                  .map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
              </ul>
            )}
            <button
              className="scanner-primary mt-4"
              disabled={saving || busy || entryIssues.length > 0 || !plan}
              onClick={() =>
                void save(async () => {
                  if (!monitoring || document.hidden || !feedRef.current)
                    throw new Error(
                      'Start visible on-screen checks and refresh before entry.'
                    );
                  await transact(
                    (b, o) =>
                      openPetal(
                        b,
                        feedRef.current!,
                        verification,
                        o,
                        new Date()
                      ),
                    true
                  );
                  setFields(blank);
                  setMessage(
                    'Paper entry recorded only in the Gold Petal pilot. No broker order was sent.'
                  );
                })
              }
            >
              Record Gold Petal paper entry
            </button>
          </div>
        </section>
      )}

      {open && (
        <section
          className="scanner-card space-y-4"
          aria-label="Gold Petal exit assistant"
        >
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-200" />
            <h2 className="font-semibold">
              4 · Manage and record the paper exit
            </h2>
          </div>
          <p className="break-all text-sm font-medium">
            {open.feed.contract?.symbol} · bought one paper lot at{' '}
            {cash(open.plan.entry)}
          </p>
          <p className="text-sm text-slate-300">
            Stop {cash(open.plan.stop)} · target {cash(open.plan.target)} · time
            exit{' '}
            {stamp(
              new Date(Date.parse(open.enteredAt) + 30 * 60000).toISOString()
            )}
          </p>
          <p
            role="status"
            aria-live="polite"
            className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-200"
          >
            {alert?.message}
          </p>
          {!monitoring && (
            <p className="text-sm text-amber-200">
              On-screen price checks are paused. Time checks still run while
              this page is open; restart price checks or use a verified manual
              exit.
            </p>
          )}
          <button
            className="scanner-secondary"
            disabled={
              !!quoteIssue ||
              feed?.contract?.symbol !== open.feed.contract?.symbol
            }
            onClick={() => {
              if (!q) return;
              const price = Math.max(1, q.bid - 5);
              setExitPrice(String(price));
              setExitSnapshot(feed);
              setExitFees(
                String(
                  Math.ceil(
                    (Math.max(
                      petalCharges(open.plan.entry, price).total,
                      open.plan.feesAtStop,
                      open.plan.feesAtTarget
                    ) +
                      2) *
                      100
                  ) / 100
                )
              );
              setExitReason(alert?.reason || 'MANUAL');
              setExitReference(
                `App bid less ₹5, exchange ${q.exchangeTime}; recheck before saving`
              );
            }}
          >
            Use latest bid less ₹5 as paper exit
          </button>
          <p className="text-xs text-slate-400">
            This fills the form only. If checks were interrupted, verify the
            actual price/time in Angel and use a manual reference. Stop and
            target touches are alerts, never automatic historical fills.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              Paper exit price
              <input
                aria-label="Paper exit price"
                className={inputClass}
                type="number"
                min="1"
                step="1"
                value={exitPrice}
                onChange={(e) => {
                  setExitPrice(e.target.value);
                  setExitSnapshot(null);
                  setExitReference('');
                }}
              />
            </label>
            <label className="text-xs">
              Full charges + rounding reserve
              <input
                aria-label="Paper exit charges"
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                value={exitFees}
                onChange={(e) => setExitFees(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Exit reason
              <select
                className={inputClass}
                value={exitReason}
                onChange={(e) =>
                  setExitReason(e.target.value as PetalExitReason)
                }
              >
                {[
                  'STOP',
                  'TARGET',
                  'TIME',
                  'DAILY_LIMIT',
                  'TRADE_RISK',
                  'DATA_GAP',
                  'MANUAL',
                ].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Exit price/time verification reference
              <input
                aria-label="Exit reference"
                className={inputClass}
                value={exitReference}
                onChange={(e) => setExitReference(e.target.value)}
                placeholder="Angel contract, observed price/time and reason"
              />
            </label>
          </div>
          <button
            className="scanner-primary"
            disabled={
              !ready ||
              saving ||
              !exitPrice ||
              !exitFees ||
              !exitReference.trim()
            }
            onClick={() =>
              void save(async () => {
                if (
                  exitSnapshot &&
                  (!feedRef.current ||
                    feedRef.current.quote?.bid !== exitSnapshot.quote?.bid)
                )
                  throw new Error(
                    'The bid changed or data became unavailable. Review the latest exit quote again.'
                  );
                await transact((b) =>
                  exitSnapshot
                    ? closePetalFromQuote(
                        b,
                        open.id,
                        feedRef.current!,
                        Number(exitFees),
                        exitReason,
                        new Date()
                      )
                    : closePetal(
                        b,
                        open.id,
                        {
                          price: Number(exitPrice),
                          charges: Number(exitFees),
                          reason: exitReason,
                          reference: exitReference,
                          source: 'BROKER_MANUAL',
                        },
                        new Date()
                      )
                );
                setExitPrice('');
                setExitFees('');
                setExitReference('');
                setExitSnapshot(null);
                setMessage('Paper exit saved only to the Gold Petal pilot.');
              })
            }
          >
            Record paper exit
          </button>
        </section>
      )}

      <section className="scanner-card space-y-4">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-semibold">Gold Petal pilot records</h2>
          <button
            className="scanner-secondary inline-flex items-center gap-2"
            onClick={download}
          >
            <Download className="h-4 w-4" />
            Export pilot backup
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Stored separately in this browser. This export contains only Gold
          Petal data. Neither stock journal nor the three-stock study is
          changed. Do not clear browser storage without a backup.
        </p>
        <p className="text-sm text-slate-300">
          {book.positions.length} paper entries · {closed.length} closed · net
          result {cash(closed.reduce((sum, p) => sum + p.exit!.net, 0))}. Early
          research results do not establish a reliable win rate.
        </p>
        {!book.positions.length ? (
          <p className="text-sm text-slate-400">
            No Gold Petal paper trades recorded.
          </p>
        ) : (
          <div className="space-y-3">
            {[...book.positions].reverse().map((p) => (
              <article
                key={p.id}
                className="rounded-xl border border-slate-700 p-4 text-sm"
              >
                <p className="break-all font-medium">
                  {p.feed.contract?.symbol}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {stamp(p.enteredAt)} · entry {cash(p.plan.entry)} · planned
                  risk {cash(p.plan.plannedRisk)}
                </p>
                <p className="mt-2">
                  {p.exit
                    ? `${p.exit.reason} · exit ${cash(p.exit.price)} · charges ${cash(p.exit.charges)} · net ${cash(p.exit.net)}`
                    : 'Open paper position'}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      <details className="scanner-card text-sm">
        <summary className="cursor-pointer font-semibold text-teal-200">
          Frozen pilot rules and validation limits
        </summary>
        <div className="mt-4 space-y-3 leading-relaxed text-slate-300">
          <p>
            <ShieldCheck className="mr-1 inline h-4 w-4" />
            Budget feasibility is conditional. One lot is one gram; the entire
            notional plus costs must fit paper equity. No fractional lots,
            leverage, short trades or averaging down.
          </p>
          <p>
            Candidate v1: completed 5-minute close above the preceding 20-bar
            high; EMA20 above EMA50; close above EMA20; volume at least 1.2× the
            prior 20-bar mean. Require 50 contiguous same-session bars. The stop
            is below the last three lows and at least one 14-bar mean true range
            from the breakout close. Do not chase more than 0.25 ATR above that
            close.
          </p>
          <p>
            Entry window 18:00–21:30 IST. A half-day MCX session may need to
            build 50 bars before it qualifies. Target at least 2R after costs.
            Exit on stop, target, risk warning, 30 minutes or 22:00 IST. Current
            bid less ₹5 models an exit; a gap can lose more than planned.
            Snapshot monitoring can miss touches. If both stop and target appear
            in one completed bar, the stop alert takes precedence.
          </p>
          <p>
            Review operational problems after five sessions. Gather at least 50
            sessions and 100 closed paper trades before assessing performance;
            one trade per day means 100 trades requires at least 100 trading
            days. Do not change thresholds mid-sample or assume the stock
            study’s results validate this strategy.
          </p>
          <p>
            The app can gate this pilot’s entries, not other apps or broker
            orders. Your outside-risk declaration and this browser’s stock books
            inform the ₹250 total-day check. Profits never refill the loss
            allowance.
          </p>
          <div className="flex flex-wrap gap-4 text-teal-200 underline">
            <a href={GOLD_PETAL_SPEC} target="_blank" rel="noreferrer">
              MCX lot and tick specification
            </a>
            <a href={MCX_CALENDAR} target="_blank" rel="noreferrer">
              MCX calendar
            </a>
            <a href={PETAL_FEES.source} target="_blank" rel="noreferrer">
              Angel normal charges
            </a>
          </div>
        </div>
      </details>
    </div>
  );
}
