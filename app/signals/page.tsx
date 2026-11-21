'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { INSTRUMENTS } from '@/lib/instruments';
import {
  findPaperSetup,
  PaperSetup,
  STRATEGY_VERSION,
} from '@/lib/paperStrategy';
import {
  closePaperPosition,
  ExitReason,
  isClosed,
  openPaperPosition,
  paperAccount,
  PAPER_BOOK_KEY,
  paperStats,
  PaperPosition,
  positionPL,
  previewPaperEntry,
} from '@/lib/paperBook';
import { getIndianMarketStatus, istDateKey } from '@/lib/marketHours';
import { analyzeMarketCondition } from '@/lib/marketCondition';
import { quoteProblem } from '@/lib/marketDataQuality';
import { usePaperBook } from '@/hooks/usePaperBook';
import NewsContext from '@/components/NewsContext';
import DataStatusPanel, {
  optionalFeedsInitial,
} from '@/components/DataStatusPanel';
import BrokerChargesPanel from '@/components/BrokerChargesPanel';
import ResearchChecklist from '@/components/ResearchChecklist';
import { comparisonReady } from '@/lib/researchEvidence';

const money = (value: number) => `₹${value.toFixed(2)}`;
const card = 'rounded-2xl border border-slate-800 bg-slate-900/60 p-4';
const input =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white';
const button =
  'rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40';
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({
  label,
  value,
  setValue,
  step = '0.01',
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="block text-sm text-slate-300">
      {label}
      <input
        className={input}
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  );
}

export default function SignalsPage() {
  const {
    watchlist,
    prices,
    candles,
    candleWarnings,
    updatePrices,
    updateCandles,
  } = useApp();
  const { book, ready, error: storageError, transact } = usePaperBook();
  const [now, setNow] = useState<Date | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [charges, setCharges] = useState('15'),
    [slippage, setSlippage] = useState('1'),
    [notes, setNotes] = useState(''),
    [reviewed, setReviewed] = useState(false);
  const [optionalFeeds, setOptionalFeeds] = useState(optionalFeedsInitial);
  const [legacyCount, setLegacyCount] = useState(0);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 5000);
    try {
      const old = JSON.parse(
        localStorage.getItem('tracked_signals_v1') || '[]'
      );
      setLegacyCount(Array.isArray(old) ? old.length : 0);
    } catch {
      setLegacyCount(0);
    }
    return () => window.clearInterval(timer);
  }, []);
  const symbols =
    book.research?.symbols ||
    watchlist
      .filter(
        (symbol) =>
          INSTRUMENTS[symbol]?.exchange === 'NSE' &&
          INSTRUMENTS[symbol]?.category !== 'INDEX'
      )
      .slice(0, 3);
  const newsSymbol = symbols[0];
  useEffect(() => {
    setOptionalFeeds(optionalFeedsInitial);
  }, [newsSymbol]);
  const account = useMemo(
    () => paperAccount(book, now || new Date(0)),
    [book, now]
  );
  const stats = useMemo(() => paperStats(book), [book]);
  const regime = useMemo(
    () => analyzeMarketCondition(candles.NIFTY || [], now || new Date(0)),
    [candles, now]
  );
  async function action(fn: () => Promise<void>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
      setNow(new Date());
    }
  }
  async function enter(setup: PaperSetup) {
    if (!comparisonReady(book, setup.symbol, new Date())) {
      setError(
        'Complete a matching supervised broker comparison for this share today.'
      );
      return;
    }
    if (!reviewed) {
      setError('Complete the session/event checklist first.');
      return;
    }
    await action(
      () =>
        transact((latest) => {
          if (!comparisonReady(latest, setup.symbol, new Date()))
            throw new Error(
              'Today’s supervised comparison is pending or failed.'
            );
          const latestSetup = findPaperSetup(
            setup.symbol,
            candles[setup.symbol] || [],
            candles.NIFTY || [],
            prices[setup.symbol],
            new Date()
          );
          if (latestSetup.setup?.id !== setup.id)
            throw new Error(
              latestSetup.reasons.join(' ') ||
                'The current setup changed. Review it again.'
            );
          return openPaperPosition(
            latest,
            setup,
            prices[setup.symbol],
            Number(charges),
            Number(slippage),
            notes,
            new Date()
          );
        }),
      'Paper entry recorded at the observed ask. No broker order was sent.'
    );
  }
  async function logSkip(symbol: string, reason: string, setup?: PaperSetup) {
    await action(
      () =>
        transact((latest) => ({
          ...latest,
          observations: [
            ...latest.observations,
            {
              id: crypto.randomUUID(),
              symbol,
              at: new Date().toISOString(),
              reason: notes.trim() ? `${reason} Note: ${notes.trim()}` : reason,
              setupId: setup?.id,
            },
          ],
        })),
      'Observation recorded. It is not counted as an entered trade.'
    );
  }
  function exportCSV() {
    const header = [
      'mode',
      'strategy',
      'symbol',
      'entry_time',
      'entry',
      'quantity',
      'initial_stop',
      'initial_target',
      'planned_total_risk',
      'exit_time',
      'exit',
      'total_charges',
      'exit_reason',
      'net_pl',
      'net_r',
      'notes',
    ];
    const rows = book.positions.map((p) => [
      p.mode,
      p.setup.version,
      p.setup.symbol,
      p.enteredAt,
      p.entry,
      p.quantity,
      p.setup.stop,
      p.setup.target,
      p.plannedRisk,
      p.exitedAt || '',
      p.exit ?? '',
      p.charges ?? '',
      p.exitReason || '',
      isClosed(p) ? positionPL(p) : '',
      isClosed(p) ? positionPL(p) / p.plannedRisk : '',
      p.notes,
    ]);
    // Prevent spreadsheet formulas in user notes while preserving numeric cells.
    const cell = (value: unknown) => {
      let text = String(value);
      if (typeof value === 'string' && /^[=+@-]/.test(text)) text = "'" + text;
      return `"${text.replaceAll('"', '""')}"`;
    };
    download(
      `paper-trades-${istDateKey()}.csv`,
      [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n'),
      'text/csv'
    );
  }
  return (
    <div className="space-y-5 pb-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">
          Phase 1 · ₹10,000 practice account
        </p>
        <h1 className="mt-2 text-3xl font-bold">Paper trading desk</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          One cash-equity setup. Recorded entries and exits. Costs included. No
          broker orders and no promised win rate.
        </p>
      </header>
      <section className={card} aria-label="Study shares and automatic checks">
        <h2 className="font-semibold">Study shares and automatic checks</h2>
        <p className="mt-2 text-sm text-slate-300">
          Shares being checked: {symbols.join(', ') || 'Choose up to three NSE cash shares in Watchlist'}.
          NIFTY supplies index confirmation. These shares are your research list;
          each needs a qualifying setup, verified data and affordable costs.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Keep Practice visible during market hours. Quotes are requested about
          every 10 seconds and candles about every 30 seconds; provider delays
          still apply. Eligible paper entries are limited to 09:45–11:15 IST.
          Checks pause when the tab is hidden. Entries and exits require your action.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          The first saved research record fixes the study shares. Keep that list
          unchanged while collecting evidence. The Scan tab screens the current
          Nifty 50 separately and does not qualify this study’s paper entries.
        </p>
        <a
          className="mt-3 inline-block text-sm text-teal-300 underline"
          href="https://github.com/kaushikin/intraday-stock-tracker-india/blob/main/docs/monday-checklist.md"
          target="_blank"
          rel="noreferrer"
        >
          Open Monday’s verification checklist
        </a>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="rounded-full bg-slate-800 px-3 py-2">
          {now
            ? getIndianMarketStatus(now).replaceAll('_', ' ')
            : 'Checking session…'}{' '}
          · IST
        </span>
        <button
          className="text-teal-300 underline disabled:opacity-40"
          disabled={busy}
          onClick={() =>
            action(async () => {
              await Promise.all([updatePrices(), updateCandles()]);
            }, 'Refresh finished. Check Data status for provider errors and timestamps.')
          }
        >
          Refresh data
        </button>
      </div>
      <DataStatusPanel symbols={symbols} now={now} optional={optionalFeeds} />
      {storageError && (
        <p role="alert" className="rounded-xl bg-red-950 p-4 text-red-200">
          {storageError} Use “Export journal backup” to preserve the stored
          data.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-950 p-4 text-red-200">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-teal-950 p-4 text-teal-200">
          {message}
        </p>
      )}
      <section className={card} aria-label="Practice risk budget">
        <h2 className="font-semibold">Risk before reward</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-400">Practice equity</dt>
            <dd className="mt-1 text-xl font-semibold">
              {money(account.equity)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Next trade budget</dt>
            <dd className="mt-1 text-xl font-semibold text-teal-300">
              {money(account.riskBudget)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Today, net</dt>
            <dd>{money(account.dailyPL)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Entries today</dt>
            <dd>{account.tradesToday} / 2</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Total loss limits: ₹50/trade or 0.5% of equity, ₹100/day, ₹250/week,
          ₹500/month and ₹500 drawdown. One open position. No leverage or fixed
          daily profit target.
        </p>
        {account.reasons.map((reason) => (
          <p key={reason} className="mt-2 text-sm text-amber-300">
            {reason}
          </p>
        ))}
      </section>
      <ResearchChecklist
        book={book}
        symbols={symbols}
        now={now}
        ready={ready}
        busy={busy}
        transact={transact}
        action={action}
      />
      <BrokerChargesPanel
        book={book}
        symbols={symbols}
        ready={ready}
        busy={busy}
        riskBudget={account.riskBudget}
        cash={account.availableCapital}
        transact={transact}
        action={action}
      />
      <details className={card}>
        <summary className="cursor-pointer font-semibold">
          The setup and session checklist
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>
            Trade research only from 09:45 to 11:15 IST. Review company results
            and major scheduled events first.
          </li>
          <li>
            Both stock and NIFTY must have rising 15-minute EMA20 trends with
            enough completed history.
          </li>
          <li>
            After two closes above EMA20 and session VWAP, a bullish candle
            touches EMA20 and closes above both.
          </li>
          <li>
            Entry is one current instrument tick above that candle’s high. Stop
            is one tick below its low; target is twice the initial price risk.
            The setup expires after two five-minute bars.
          </li>
          <li>
            Skip late entries, wide spreads, obstructing highs, stale data and
            costs that make net reward/risk less than 1.2.
          </li>
          <li>
            Exit the whole paper position at the actual observed stop/target, or
            after 30 minutes. Record the exit explicitly; this browser is not an
            execution engine.
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Research specification {STRATEGY_VERSION}. These rules have not been
          shown to be profitable. The first saved research record fixes up to
          three study shares.
        </p>
      </details>
      <section className={card}>
        <h2 className="font-semibold">Before considering an entry</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field
            label="Round-trip charges (₹)"
            value={charges}
            setValue={setCharges}
          />
          <Field
            label="Slippage reserve (₹)"
            value={slippage}
            setValue={setSlippage}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Use the broker’s estimate for this quantity, including all taxes and
          levies. ₹15 + ₹1 is an unverified placeholder, not a quote from your
          broker. Small accounts may have no qualifying trades after costs; do
          not increase risk to force one.
        </p>
        {Number(charges) + Number(slippage) >
          (account.riskBudget * (2 - 1.2)) / 3 && (
          <p className="mt-3 text-sm text-amber-300">
            At the current risk budget, a 2R target needs total estimated costs
            of at most {money((account.riskBudget * (2 - 1.2)) / 3)} to meet net
            R:R 1.2. The entered costs cannot qualify. Use verified costs; do
            not lower them just to pass.
          </p>
        )}
        <label className="mt-4 block text-sm text-slate-300">
          Session / event notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            className={input}
            placeholder="Company results checked; no conflicting event; able to supervise."
          />
        </label>
        <label className="mt-3 flex gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I checked scheduled events, verified the broker’s cost estimate and
          can supervise this paper trade.
        </label>
      </section>
      <section aria-label="Current research setups" className="space-y-3">
        <h2 className="text-lg font-semibold">Watch, qualify, then record</h2>
        {!symbols.length && (
          <p className={card}>
            Add up to three supported cash shares in{' '}
            <Link className="text-teal-300 underline" href="/watchlist">
              Watchlist
            </Link>
            .
          </p>
        )}
        {symbols.map((symbol) => {
          const decision = findPaperSetup(
            symbol,
            candles[symbol] || [],
            candles.NIFTY || [],
            prices[symbol],
            now || new Date(0)
          );
          const setup = decision.setup;
          const preview = setup
            ? previewPaperEntry(
                book,
                setup,
                prices[symbol],
                Number(charges),
                Number(slippage),
                now || new Date(0)
              )
            : undefined;
          const compared = !!now && comparisonReady(book, symbol, now);
          const reasons = [
            ...(preview?.reasons || decision.reasons),
            ...(!compared
              ? [
                  'Supervised broker comparison for this share is pending today.',
                ]
              : []),
          ];
          return (
            <article key={symbol} className={card}>
              <div className="flex justify-between gap-2">
                <h3 className="font-bold">{symbol}</h3>
                <span
                  className={`text-xs ${preview?.allowed && compared ? 'text-teal-300' : 'text-amber-300'}`}
                >
                  {preview?.allowed && compared
                    ? 'Paper entry eligible'
                    : 'Watch only'}
                </span>
              </div>
              {setup && (
                <>
                  <dl className="my-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-500">Trigger</dt>
                      <dd>{money(setup.entry)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Stop</dt>
                      <dd>{money(setup.stop)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Target</dt>
                      <dd>{money(setup.target)}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-slate-400">
                    Proposed quantity {preview?.sizing.suggestedQuantity} ·
                    total risk {money(preview?.sizing.netLossAtStop || 0)} · net
                    R:R {preview?.sizing.netRiskReward.toFixed(2)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Setup candle{' '}
                    {new Date(setup.barTime).toLocaleTimeString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                    })}{' '}
                    IST · expires{' '}
                    {new Date(setup.expiresAt).toLocaleTimeString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                    })}{' '}
                    IST
                  </p>
                </>
              )}
              {reasons.map((reason) => (
                <p key={reason} className="mt-2 text-sm text-slate-400">
                  {reason}
                </p>
              ))}
              <div className="mt-4 flex flex-wrap gap-3">
                {setup && (
                  <button
                    disabled={
                      !ready ||
                      busy ||
                      !reviewed ||
                      !notes.trim() ||
                      !compared ||
                      !preview?.allowed
                    }
                    onClick={() => enter(setup)}
                    className={button}
                  >
                    Record paper entry at ask
                  </button>
                )}
                <button
                  disabled={!ready || busy}
                  className="text-xs text-slate-400 underline disabled:opacity-40"
                  onClick={() =>
                    logSkip(
                      symbol,
                      reasons.join(' ') || 'Eligible setup passed by trader.',
                      setup
                    )
                  }
                >
                  Log observation / skip
                </button>
              </div>
            </article>
          );
        })}
      </section>
      {candleWarnings.length > 0 && (
        <div className="text-xs text-amber-300">
          {candleWarnings.map((warning, i) => (
            <p key={i}>
              {warning.symbol}: {warning.error || warning.warning}
            </p>
          ))}
        </div>
      )}
      {account.open.map((position) => (
        <OpenPosition
          key={position.id}
          position={position}
          quote={prices[position.setup.symbol]}
          now={now}
          busy={busy}
          onClose={(exit, cost, reason, at) =>
            action(
              () =>
                transact((latest) =>
                  closePaperPosition(
                    latest,
                    position.id,
                    exit,
                    cost,
                    reason,
                    at,
                    new Date()
                  )
                ),
              'Paper exit recorded with its price, costs and time.'
            )
          }
        />
      ))}
      <section className={card}>
        <h2 className="font-semibold">Evidence, not a promised percentage</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-400">Closed paper trades</dt>
            <dd className="text-xl">{stats.count} / 100</dd>
          </div>
          <div>
            <dt className="text-slate-400">Sessions with entries</dt>
            <dd className="text-xl">{stats.sessions} / 50</dd>
          </div>
          <div>
            <dt className="text-slate-400">Net expectancy / trade</dt>
            <dd>{stats.count ? money(stats.expectancy) : 'No sample yet'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Net win rate</dt>
            <dd>
              {stats.winRate === null
                ? 'No sample yet'
                : `${stats.winRate.toFixed(1)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Net profit factor</dt>
            <dd>
              {stats.profitFactor === null
                ? stats.count
                  ? 'No net losing trades'
                  : 'No sample yet'
                : stats.profitFactor.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Maximum drawdown</dt>
            <dd>{money(account.maxDrawdown)}</dd>
          </div>
        </dl>
        {stats.interval && (
          <p className="mt-3 text-xs text-slate-400">
            95% Wilson interval: {stats.interval[0].toFixed(1)}–
            {stats.interval[1].toFixed(1)}%. Assumes comparable independent
            trades; regimes and correlated trades weaken that assumption.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          {stats.wins} wins · {stats.losses} losses · {stats.breakeven} zero-net
          trades. Manual and time exits count. No trade is created from a target
          touch. Completing the sample does not automatically approve live
          trading.
        </p>
      </section>
      <details className={card}>
        <summary className="cursor-pointer font-semibold">
          Paper journal · {book.positions.length} positions ·{' '}
          {book.observations.length} observations
        </summary>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="text-sm text-teal-300 underline"
            onClick={() =>
              download(
                `paper-journal-${istDateKey()}.json`,
                localStorage.getItem(PAPER_BOOK_KEY) || JSON.stringify(book),
                'application/json'
              )
            }
          >
            Export journal backup
          </button>
          <button
            className="text-sm text-teal-300 underline"
            disabled={!ready}
            onClick={exportCSV}
          >
            Export trade CSV
          </button>
          <Link className="text-sm text-teal-300 underline" href="/settings">
            Restore in Settings
          </Link>
        </div>
        {book.positions
          .slice()
          .reverse()
          .map((p) => (
            <div
              className="mt-4 border-t border-slate-800 pt-3 text-sm"
              key={p.id}
            >
              <p className="font-semibold">
                {p.setup.symbol} · {p.quantity} shares ·{' '}
                {isClosed(p) ? p.exitReason : 'OPEN'}
              </p>
              <p className="text-slate-400">
                Entry {money(p.entry)} ·{' '}
                {isClosed(p)
                  ? `exit ${money(p.exit!)} · net ${money(positionPL(p))}`
                  : 'Exit not yet recorded'}
              </p>
              <p className="text-xs text-slate-500">{p.notes}</p>
            </div>
          ))}
        {book.observations
          .slice(-10)
          .reverse()
          .map((o) => (
            <p className="mt-3 text-xs text-slate-500" key={o.id}>
              {o.symbol} · {o.reason}
            </p>
          ))}
      </details>
      <section className={card}>
        <h2 className="font-semibold">NIFTY condition · research only</h2>
        <p className="mt-2 text-sm text-slate-400">
          {regime.available
            ? `Wilder ADX ${regime.adxValue.toFixed(1)} · ATR ${regime.atrPercent.toFixed(3)}% · ${regime.trendStrength} trend`
            : 'Current indicator data unavailable'}
        </p>
        <p className="mt-2 text-xs text-slate-500">{regime.recommendation}</p>
      </section>
      {symbols[0] && (
        <NewsContext
          key={symbols[0]}
          symbol={symbols[0]}
          onStatus={setOptionalFeeds}
        />
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        This browser stores the paper journal. Export backups regularly. A
        suspended tab cannot monitor levels or observe every opportunity. Your{' '}
        {legacyCount} older signal records and existing trade journal are
        retained separately in{' '}
        <Link href="/analytics" className="underline">
          legacy analytics
        </Link>
        ; they do not contribute to this sample. Futures and CE/PE are excluded
        from this cash-only study.
      </p>
    </div>
  );
}

function OpenPosition({
  position: p,
  quote,
  now,
  busy,
  onClose,
}: {
  position: PaperPosition;
  quote: Parameters<typeof quoteProblem>[0];
  now: Date | null;
  busy: boolean;
  onClose: (
    exit: number,
    charges: number,
    reason: ExitReason,
    at: string
  ) => Promise<void>;
}) {
  const [exit, setExit] = useState(''),
    [charges, setCharges] = useState(String(p.estimatedCharges)),
    [reason, setReason] = useState<ExitReason>('MANUAL'),
    [time, setTime] = useState('');
  const fresh = now && !quoteProblem(quote, now),
    elapsed = now ? (now.getTime() - Date.parse(p.enteredAt)) / 60000 : 0;
  const level =
    fresh && quote?.bid
      ? quote.bid <= p.setup.stop
        ? 'Stop level observed'
        : quote.bid >= p.setup.target
          ? 'Target level observed'
          : elapsed >= 30
            ? '30-minute time exit due'
            : 'Position open'
      : elapsed >= 30
        ? '30-minute time exit due; feed unavailable'
        : 'Feed unavailable — verify the position manually';
  return (
    <section className="rounded-2xl border border-amber-600/60 bg-amber-950/20 p-4">
      <h2 className="font-bold">Open paper position · {p.setup.symbol}</h2>
      <p className="mt-2 text-sm text-amber-300">
        {level}. Record the observed exit; no automatic fill is assumed.
      </p>
      <p className="mt-2 text-sm text-slate-300">
        {p.quantity} shares at {money(p.entry)} · stop {money(p.setup.stop)} ·
        target {money(p.setup.target)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field
          label="Observed exit price (₹)"
          value={exit}
          setValue={setExit}
        />
        <Field
          label="Total round-trip charges (₹)"
          value={charges}
          setValue={setCharges}
        />
      </div>
      <button
        className="mt-2 text-xs text-teal-300 underline disabled:opacity-40"
        disabled={!fresh || !quote?.bid}
        onClick={() => setExit(String(quote?.bid || ''))}
      >
        Use current bid
      </button>
      <label className="mt-4 block text-sm text-slate-300">
        Exit reason
        <select
          className={input}
          value={reason}
          onChange={(e) => setReason(e.target.value as ExitReason)}
        >
          <option value="MANUAL">Manual exit</option>
          <option value="STOP">Stop exit</option>
          <option value="TARGET">Target exit</option>
          <option value="TIME">30-minute time exit</option>
        </select>
      </label>
      <label className="mt-3 block text-sm text-slate-300">
        Observed exit time (IST, blank = now)
        <input
          className={input}
          type="datetime-local"
          step="1"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </label>
      <button
        className={`${button} mt-4`}
        disabled={busy || !exit || !charges}
        onClick={() =>
          onClose(
            Number(exit),
            Number(charges),
            reason,
            time ? `${time}+05:30` : new Date().toISOString()
          )
        }
      >
        Record paper exit
      </button>
    </section>
  );
}
