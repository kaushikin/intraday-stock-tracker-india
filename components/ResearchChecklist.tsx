'use client';
import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { PaperBook } from '@/lib/paperBook';
import { paperStats } from '@/lib/paperBook';
import { STRATEGY_VERSION } from '@/lib/paperStrategy';
import {
  captureComparison,
  comparisonReady,
  recordComparison,
  recordFiveSessionReview,
  recordSessionReview,
  type ComparisonSnapshot,
} from '@/lib/researchEvidence';
import {
  isIndianMarketOpen,
  isTradingDayIST,
  getISTMinutes,
  istDateKey,
} from '@/lib/marketHours';
import { displayTime } from './DataStatusPanel';
const input =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white';
const button =
  'mt-3 rounded-xl bg-teal-700 px-4 py-2 text-sm disabled:opacity-40';
type Props = {
  book: PaperBook;
  symbols: string[];
  ready: boolean;
  busy: boolean;
  now: Date | null;
  transact: (fn: (book: PaperBook) => PaperBook) => Promise<void>;
  action: (fn: () => Promise<void>, success: string) => Promise<void>;
};
const blank = {
  ltp: '',
  quoteTime: '',
  barTime: '',
  stockOpen: '',
  stockHigh: '',
  stockLow: '',
  stockClose: '',
  stockVolume: '',
  indexOpen: '',
  indexHigh: '',
  indexLow: '',
  indexClose: '',
};
export default function ResearchChecklist({
  book,
  symbols,
  ready,
  busy,
  now,
  transact,
  action,
}: Props) {
  const { prices, candles } = useApp();
  const [selected, setSelected] = useState(symbols[0] || ''),
    [snapshot, setSnapshot] = useState<ComparisonSnapshot | null>(null),
    [broker, setBroker] = useState(blank),
    [localError, setLocalError] = useState('');
  const [notes, setNotes] = useState(''),
    [missed, setMissed] = useState('0'),
    [adherence, setAdherence] = useState(''),
    [reviewNotes, setReviewNotes] = useState('');
  const symbol = symbols.includes(selected) ? selected : symbols[0] || '';
  const day = now ? istDateKey(now) : '',
    stats = paperStats(book),
    evidence = book.research;
  const sessions = evidence?.sessions || [],
    todayDone = sessions.some((s) => s.day === day);
  function capture() {
    setLocalError('');
    try {
      setSnapshot(
        captureComparison(
          symbol,
          prices[symbol],
          candles[symbol] || [],
          candles.NIFTY || [],
          new Date()
        )
      );
      setBroker(blank);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Snapshot unavailable.');
    }
  }
  async function saveComparison() {
    if (!snapshot) return;
    await action(
      () =>
        transact((latest) =>
          recordComparison(
            latest,
            symbols,
            snapshot,
            {
              ltp: Number(broker.ltp),
              quoteTime: `${istDateKey(new Date(snapshot.capturedAt))}T${broker.quoteTime}+05:30`,
              barTime: `${istDateKey(new Date(snapshot.capturedAt))}T${broker.barTime}+05:30`,
              stock: {
                open: Number(broker.stockOpen),
                high: Number(broker.stockHigh),
                low: Number(broker.stockLow),
                close: Number(broker.stockClose),
                volume: Number(broker.stockVolume),
              },
              index: {
                open: Number(broker.indexOpen),
                high: Number(broker.indexHigh),
                low: Number(broker.indexLow),
                close: Number(broker.indexClose),
              },
            },
            new Date()
          )
        ),
      'Comparison saved. Check its result below; mismatches do not pass verification.'
    );
  }
  const current = evidence?.comparisons.filter(
    (c) => istDateKey(new Date(c.at)) === day
  );
  return (
    <section
      className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4"
      aria-label="Research readiness"
    >
      <h2 className="text-lg font-semibold">Research readiness</h2>
      <p className="mt-2 text-sm text-slate-300">
        Strategy fixed: {STRATEGY_VERSION}.{' '}
        {evidence
          ? `Study universe fixed: ${evidence.symbols.join(', ')}.`
          : 'The first saved research record fixes these study shares: ' +
            (symbols.join(', ') || 'choose shares in Watchlist') +
            '.'}
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Entry/exit rules, ₹50 risk cap and net R:R 1.2 remain unchanged.
        Operational checks do not tune the strategy or approve live trading.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-slate-950 p-3">
          Session reviews
          <strong className="mt-1 block text-lg">{sessions.length} / 5</strong>
        </div>
        <div className="rounded-lg bg-slate-950 p-3">
          Closed trades
          <strong className="mt-1 block text-lg">{stats.count} / 100</strong>
        </div>
        <div className="rounded-lg bg-slate-950 p-3">
          Entry sessions
          <strong className="mt-1 block text-lg">{stats.sessions} / 50</strong>
        </div>
      </div>
      <details className="mt-4 border-t border-slate-800 pt-3" open>
        <summary className="cursor-pointer font-semibold">
          1. Supervised market-hours comparison
        </summary>
        <p className="mt-2 text-xs text-slate-400">
          Open Angel One’s terminal alongside this app. During a regular market
          session, capture a snapshot, then enter independent terminal values
          for the displayed stock and NIFTY five-minute bars. Use the same
          candle start time and record the quote’s exchange timestamp. Save
          within five minutes.
        </p>
        {!now || !isIndianMarketOpen(now) ? (
          <p className="mt-3 text-sm text-amber-300">
            Pending market hours. A weekend or off-hours connection check cannot
            complete this step.
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-400">
            Quote timestamps must be within 30 seconds. Stock price tolerance:
            one tick; NIFTY OHLC: ₹0.01; stock volume must match.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-xs">
            Compare share
            <select
              className={input}
              value={symbol}
              onChange={(e) => {
                setSelected(e.target.value);
                setSnapshot(null);
                setBroker(blank);
              }}
            >
              {symbols.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button
            className={button}
            disabled={
              !ready || busy || !now || !isIndianMarketOpen(now) || !symbol
            }
            onClick={capture}
          >
            Capture app snapshot
          </button>
        </div>
        {localError && (
          <p role="alert" className="mt-2 text-sm text-amber-300">
            {localError}
          </p>
        )}
        {snapshot && (
          <div className="mt-3 rounded-lg bg-slate-950 p-3">
            <p className="text-sm font-semibold">
              Captured {snapshot.symbol} · LTP {snapshot.ltp}
            </p>
            <p className="text-xs text-slate-400">
              Exchange {displayTime(snapshot.exchangeTime)}
            </p>
            <p className="mt-2 text-xs text-slate-300">
              Candle start: {displayTime(snapshot.stock.time)}
            </p>
            <p className="text-xs text-slate-400">
              Stock O/H/L/C: {snapshot.stock.open} / {snapshot.stock.high} /{' '}
              {snapshot.stock.low} / {snapshot.stock.close} · volume{' '}
              {snapshot.stock.volume}
            </p>
            <p className="text-xs text-slate-400">
              NIFTY O/H/L/C: {snapshot.index.open} / {snapshot.index.high} /{' '}
              {snapshot.index.low} / {snapshot.index.close}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(Object.keys(blank) as (keyof typeof blank)[]).map((key) => (
                <label key={key} className="text-xs">
                  {
                    {
                      ltp: 'Broker stock LTP',
                      quoteTime: 'Broker quote time (IST)',
                      barTime: 'Broker candle start (IST)',
                      stockOpen: 'Broker stock open',
                      stockHigh: 'Broker stock high',
                      stockLow: 'Broker stock low',
                      stockClose: 'Broker stock close',
                      stockVolume: 'Broker stock volume',
                      indexOpen: 'Broker NIFTY open',
                      indexHigh: 'Broker NIFTY high',
                      indexLow: 'Broker NIFTY low',
                      indexClose: 'Broker NIFTY close',
                    }[key]
                  }
                  <input
                    className={input}
                    type={
                      key === 'quoteTime' || key === 'barTime'
                        ? 'time'
                        : 'number'
                    }
                    min={
                      key === 'quoteTime' || key === 'barTime' ? undefined : '0'
                    }
                    step={
                      key === 'quoteTime' ||
                      key === 'barTime' ||
                      key === 'stockVolume'
                        ? '1'
                        : '0.01'
                    }
                    value={broker[key]}
                    onChange={(e) =>
                      setBroker((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              className={button}
              disabled={
                !ready || busy || Object.values(broker).some((v) => !v.trim())
              }
              onClick={saveComparison}
            >
              Save independent comparison
            </button>
          </div>
        )}
        <div className="mt-3 space-y-1">
          {symbols.map((s) => (
            <p className="text-xs" key={s}>
              {s}:{' '}
              {now && comparisonReady(book, s, now)
                ? 'Comparison matched today'
                : 'Pending / needs review — paper entry blocked'}
            </p>
          ))}
        </div>
        {current?.slice(-3).map((c) => (
          <div key={c.id} className="mt-2 text-xs text-slate-400">
            <p>
              {c.snapshot.symbol} · {displayTime(c.at)} ·{' '}
              {c.passed ? 'Matched entered broker values' : 'Needs review'}
            </p>
            {c.issues.map((issue) => (
              <p key={issue} className="text-amber-300">
                {issue}
              </p>
            ))}
          </div>
        ))}
        <p className="mt-3 text-xs text-slate-500">
          These are your recorded observations, not an automated independent
          feed certification. Freshness and entry checks continue on every
          setup.
        </p>
      </details>
      <details className="mt-4 border-t border-slate-800 pt-3">
        <summary className="cursor-pointer font-semibold">
          2. End-of-session review
        </summary>
        <p className="mt-2 text-xs text-slate-400">
          After 11:45 IST, record feed problems, cost discrepancies and missed
          opportunities. Sessions with observations and no trades can count
          toward the five-session operational review. Each date counts once.
        </p>
        <label className="mt-3 block text-xs">
          Session findings
          <textarea
            className={input}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs">
            Missed opportunities
            <input
              className={input}
              type="number"
              min="0"
              step="1"
              value={missed}
              onChange={(e) => setMissed(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Rules followed?
            <select
              className={input}
              value={adherence}
              onChange={(e) => setAdherence(e.target.value)}
            >
              <option value="">Choose</option>
              <option value="yes">Yes</option>
              <option value="no">No — explained in notes</option>
            </select>
          </label>
        </div>
        <button
          className={button}
          disabled={
            !ready ||
            busy ||
            !now ||
            !isTradingDayIST(now) ||
            getISTMinutes(now) < 705 ||
            todayDone ||
            !notes.trim() ||
            !missed.trim() ||
            !adherence
          }
          onClick={() =>
            action(
              () =>
                transact((latest) =>
                  recordSessionReview(
                    latest,
                    symbols,
                    {
                      notes,
                      missedOpportunities: Number(missed),
                      rulesFollowed: adherence === 'yes',
                    },
                    new Date()
                  )
                ),
              'Session review saved. The strategy and its sample remain unchanged.'
            )
          }
        >
          {todayDone
            ? 'Today’s review recorded'
            : 'Record today’s session review'}
        </button>
        {sessions.slice(-5).map((s) => (
          <p key={s.day} className="mt-2 text-xs text-slate-400">
            {s.day}: {s.notes} · missed {s.missedOpportunities} · rules{' '}
            {s.rulesFollowed ? 'followed' : 'not followed'}
          </p>
        ))}
      </details>
      <details className="mt-4 border-t border-slate-800 pt-3">
        <summary className="cursor-pointer font-semibold">
          3. Review milestones
        </summary>
        <p className="mt-2 text-xs text-slate-400">
          Five-session operational review:{' '}
          {evidence?.fiveSessionReview
            ? 'recorded'
            : sessions.length >= 5
              ? 'due'
              : 'pending five completed sessions'}
          . Review feed mismatches, charge differences and execution mistakes.
          Keep the trading rules fixed.
        </p>
        <label className="mt-3 block text-xs">
          Five-session operational findings
          <textarea
            className={input}
            maxLength={2000}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
          />
        </label>
        <button
          className={button}
          disabled={
            !ready ||
            busy ||
            sessions.length < 5 ||
            !!evidence?.fiveSessionReview ||
            !reviewNotes.trim()
          }
          onClick={() =>
            action(
              () =>
                transact((latest) =>
                  recordFiveSessionReview(
                    latest,
                    symbols,
                    reviewNotes,
                    new Date()
                  )
                ),
              'Five-session operational review saved; no strategy parameters were changed.'
            )
          }
        >
          Record operational review
        </button>
        {evidence?.fiveSessionReview && (
          <p className="mt-2 text-xs text-slate-300">
            {evidence.fiveSessionReview.notes}
          </p>
        )}
        <p className="mt-3 text-sm text-slate-300">
          Performance review:{' '}
          {stats.count >= 100 && stats.sessions >= 50
            ? 'sample-count checkpoint reached; evaluate costs, expectancy, drawdown and adherence'
            : 'pending at least 100 closed paper trades across 50 sessions with entries'}
          .
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Completing either milestone does not demonstrate a 70% win rate or
          authorize live trading. Exports include this research evidence.
        </p>
      </details>
    </section>
  );
}
