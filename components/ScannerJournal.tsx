'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { PriceData } from '@/contexts/AppContext';
import { useScannerBook } from '@/hooks/useScannerBook';
import {
  addScannerObservation,
  captureComparison,
  closeScannerPosition,
  latestScannerComparison,
  openScannerPosition,
  parseScannerBook,
  previewScannerEntry,
  quoteProblem,
  saveScannerComparison,
  saveScannerFees,
  scannerCSV,
  scannerStats,
  scannerVersionBook,
  SCANNER_BOOK_KEY,
  sharedAccount,
  type ScannerBook,
  type ScannerContext,
  type ScannerPosition,
} from '@/lib/scannerJournal';
import { isClosed, positionPL, type ExitReason } from '@/lib/paperBook';
import type { ComparisonSnapshot } from '@/lib/researchEvidence';
import { estimateCashCharges } from '@/lib/brokerCharges';
import {
  STRATEGY_VERSION,
  SCANNER_3R_VERSION,
  type CashStrategyVersion,
} from '@/lib/paperStrategy';
import { fetchScannerQuote } from '@/lib/scannerFeed';
import { isIndianMarketOpen, istDateKey } from '@/lib/marketHours';
import { displayTime } from './DataStatusPanel';

const card = 'rounded-2xl border border-slate-700 bg-slate-900/60 p-4';
const input =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white';
const button =
  'rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold disabled:opacity-40';
const money = (n: number) => `₹${n.toFixed(2)}`;
export function downloadScannerFile(
  name: string,
  value: string,
  type = 'application/json'
) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({
  label,
  value,
  set,
  type = 'number',
}: {
  label: string;
  value: string;
  set: (s: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs">
      {label}
      <input
        className={input}
        type={type}
        step={type === 'time' ? '1' : 'any'}
        min={type === 'number' ? '0' : undefined}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}
const blankBroker = {
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
const brokerLabels: Record<keyof typeof blankBroker, string> = {
  ltp: 'Broker stock LTP',
  quoteTime: 'Broker exchange quote time (IST)',
  barTime: 'Broker candle start time (IST)',
  stockOpen: 'Broker stock open',
  stockHigh: 'Broker stock high',
  stockLow: 'Broker stock low',
  stockClose: 'Broker stock close',
  stockVolume: 'Broker stock candle volume',
  indexOpen: 'Broker NIFTY open',
  indexHigh: 'Broker NIFTY high',
  indexLow: 'Broker NIFTY low',
  indexClose: 'Broker NIFTY close',
};
function SnapshotTable({ snapshot }: { snapshot: ComparisonSnapshot }) {
  return (
    <div className="mt-3 overflow-x-auto text-xs">
      <p>
        Captured {displayTime(snapshot.capturedAt)} · exchange{' '}
        {displayTime(snapshot.exchangeTime)} · LTP {money(snapshot.ltp)}
      </p>
      <p>
        Completed candle start {displayTime(snapshot.stock.time)}. Compare this
        exact bar in Angel One.
      </p>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr>
            {['Feed', 'Open', 'High', 'Low', 'Close', 'Volume'].map((h) => (
              <th className="p-1" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['Stock', snapshot.stock],
            ['NIFTY', snapshot.index],
          ].map(([name, data]) => {
            const c = data as ComparisonSnapshot['stock'];
            return (
              <tr key={String(name)}>
                <td className="p-1">{String(name)}</td>
                {[c.open, c.high, c.low, c.close].map((v, i) => (
                  <td className="p-1" key={i}>
                    {v}
                  </td>
                ))}
                <td className="p-1">{name === 'Stock' ? c.volume : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ScannerJournal({
  context,
  selected,
  now,
  scanBusy,
  recheck,
}: {
  context: ScannerContext | null;
  selected: string;
  now: Date | null;
  scanBusy: boolean;
  recheck: () => void;
}) {
  const journal = useScannerBook();
  const { book, study, symbols, ready, studyReady, transact } = journal;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [snapshot, setSnapshot] = useState<ComparisonSnapshot | null>(null),
    [broker, setBroker] = useState(blankBroker);
  const [feeStop, setFeeStop] = useState(''),
    [feeTarget, setFeeTarget] = useState(''),
    [feeRef, setFeeRef] = useState(''),
    [feeSource, setFeeSource] = useState<
      'BROKER_CALCULATOR' | 'ACCOUNT_TARIFF'
    >('BROKER_CALCULATOR');
  const [notes, setNotes] = useState(''),
    [reviewed, setReviewed] = useState(false),
    [observation, setObservation] = useState('');
  const [incoming, setIncoming] = useState<ScannerBook | null>(null),
    [replaceUnreadable, setReplaceUnreadable] = useState(false);
  const [historyVersion, setHistoryVersion] =
    useState<CashStrategyVersion>(SCANNER_3R_VERSION);
  const lock = useRef(false);
  useEffect(() => {
    setSnapshot(null);
    setBroker(blankBroker);
    setNotes('');
    setReviewed(false);
    setError('');
  }, [selected]);
  const clock = now || new Date(0);
  const preview =
    context && now && ready && studyReady
      ? previewScannerEntry(book, study, symbols, context, now)
      : null;
  const feeKey = preview?.key || '';
  const lastFeeKey = useRef('');
  useEffect(() => {
    if (feeKey && feeKey !== lastFeeKey.current) {
      lastFeeKey.current = feeKey;
      setFeeStop('');
      setFeeTarget('');
      setFeeRef('');
      setReviewed(false);
    }
  }, [feeKey]);
  const versionBook = scannerVersionBook(book, historyVersion);
  const stats = scannerStats(book, historyVersion),
    account = sharedAccount(book, study, clock);
  const comparison = now
    ? latestScannerComparison(book, selected, now)
    : undefined;
  async function action(fn: () => void | Promise<void>, success: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const disabled = !ready || busy;
  function capture() {
    void action(() => {
      if (!context) throw new Error('Recheck this share first.');
      setSnapshot(
        captureComparison(
          selected,
          context.data.quotes[selected],
          context.data.candles[selected] || [],
          context.data.candles.NIFTY || []
        )
      );
      setBroker(blankBroker);
    }, 'Snapshot captured. Enter independent Angel One values; save within five minutes.');
  }
  function saveComparison() {
    void action(async () => {
      if (!snapshot || Object.values(broker).some((v) => !v.trim()))
        throw new Error('Complete all broker fields independently.');
      const day = istDateKey(new Date(snapshot.capturedAt));
      await transact((b) =>
        saveScannerComparison(b, snapshot, {
          ltp: Number(broker.ltp),
          quoteTime: `${day}T${broker.quoteTime}+05:30`,
          barTime: `${day}T${broker.barTime}+05:30`,
          stock: {
            open: +broker.stockOpen,
            high: +broker.stockHigh,
            low: +broker.stockLow,
            close: +broker.stockClose,
            volume: +broker.stockVolume,
          },
          index: {
            open: +broker.indexOpen,
            high: +broker.indexHigh,
            low: +broker.indexLow,
            close: +broker.indexClose,
          },
        })
      );
      setSnapshot(null);
      setBroker(blankBroker);
    }, 'Comparison saved. A mismatch blocks entry until a fresh comparison passes.');
  }
  function saveFees() {
    void action(async () => {
      if (!context || !feeStop.trim() || !feeTarget.trim())
        throw new Error('Enter both fee totals.');
      await transact((b, s, fixed) => {
        const current = previewScannerEntry(b, s, fixed, context);
        if (
          !current.key ||
          current.result?.status !== 'SHORTLIST' ||
          current.key !== feeKey
        )
          throw new Error(
            'The quote or proposed quantity changed. Recheck and verify the new fees.'
          );
        return saveScannerFees(b, {
          key: current.key,
          symbol: selected,
          atStop: +feeStop,
          atTarget: +feeTarget,
          source: feeSource,
          reference: feeRef,
        });
      }, true);
    }, 'Fee comparison saved for this exact proposed trade. Review any remaining entry blocks.');
  }
  return (
    <section
      id="scanner-journal"
      className="space-y-4"
      aria-label="Scanner paper journal"
    >
      <div className={card}>
        <h2 className="text-xl font-semibold">Scanner paper journal</h2>
        <p className="mt-2 text-sm">
          Active version: scanner-cash-3r-v2. New 3R entries and old 2R history
          have separate statistics and CSVs. Neither enters the three-share
          study.
        </p>
        <p className="mt-2 text-xs text-amber-200">
          Saved on this browser/device only, not on GitHub or Vercel. Use one
          device and export backups. Private browsing, clearing site data or
          changing devices can lose access to these records.
        </p>
        <p className="mt-2 text-xs text-slate-300">
          Study shares:{' '}
          {studyReady ? symbols.join(', ') || 'not selected' : 'checking…'}. Use{' '}
          <Link href="/signals" className="underline">
            Practice
          </Link>{' '}
          for their entries.
        </p>
        <p className="mt-2 text-xs">
          Both journals share entry safety limits: one open position, ₹100/day,
          ₹250/week, ₹500/month and ₹500 drawdown. A 3R entry is allowed only if
          neither journal has an entry today, and consumes today’s entry
          allowance. Practice keeps its own two-entry limit on days without 3R.
        </p>
        {ready && studyReady && now && (
          <p className="mt-2 text-sm">
            Combined equity {money(account.equity)} · remaining risk per entry{' '}
            {money(account.riskBudget)} · combined entries today{' '}
            {account.tradesToday}
          </p>
        )}
        {(!ready || !studyReady) && (
          <p role="alert" className="mt-2 text-amber-200">
            {journal.error || journal.studyError || 'Loading journals…'} New
            entries are blocked until both journals can be read. Existing
            scanner exits remain available when its own journal is readable.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-amber-200">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-2 text-teal-300">
            {message}
          </p>
        )}
        <label className="mt-3 block text-xs">
          Scanner results version
          <select
            className={input}
            value={historyVersion}
            onChange={(e) =>
              setHistoryVersion(e.target.value as CashStrategyVersion)
            }
          >
            <option value={SCANNER_3R_VERSION}>
              3R v2 — active paper sample
            </option>
            <option value={STRATEGY_VERSION}>2R v1 — preserved history</option>
          </select>
        </label>
        <p className="mt-3 text-sm">
          {historyVersion === SCANNER_3R_VERSION
            ? '3R v2 only'
            : '2R v1 history only'}
          : {stats.count} closed · {stats.wins} wins · {stats.losses} losses ·{' '}
          {stats.breakeven} breakeven · net {money(stats.net)} ·{' '}
          {stats.winRate === null
            ? 'win rate not available'
            : `${stats.winRate.toFixed(1)}% net winners`}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          All closed entries, including time/manual exits and mistakes, stay in
          the sample. This is not a demonstrated win probability.
        </p>
      </div>

      {book.positions
        .filter((p) => !isClosed(p))
        .map((p) => (
          <ScannerOpenPosition
            key={p.id}
            position={p}
            now={clock}
            disabled={disabled}
            close={(exit, fees, reason, time, text) =>
              action(
                () =>
                  transact((b) =>
                    closeScannerPosition(
                      b,
                      p.id,
                      exit,
                      fees,
                      reason,
                      time,
                      text
                    )
                  ),
                'Scanner paper exit recorded. No broker order was sent.'
              )
            }
          />
        ))}

      <details className={card} open>
        <summary className="cursor-pointer font-semibold">
          Monday preparation and checks
        </summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Before 09:45 IST: sign in, check Angel One access, confirm your
            fixed study shares and restore the correct backups if needed. Use
            the same device/browser.
          </li>
          <li>
            Verify broker account charges and scheduled company events. The fee
            calculator is an estimate; paper trades do not generate contract
            notes.
          </li>
          <li>
            Scan 09:45–11:15. Review a candidate, capture its completed candles
            below, independently enter Angel One values, save the comparison and
            exact trade fees.
          </li>
          <li>
            Recheck before entry. If prices/quantity change, verify fees again.
            Keep realistic costs; zero qualifying stocks is a valid outcome.
          </li>
          <li>
            Supervise an open position. Quotes refresh about every 10 seconds
            while visible in market hours. There are no background stops,
            automatic exits, or broker orders.
          </li>
          <li>
            After 11:45: close any due positions, log skipped opportunities/data
            gaps and export both journals separately. Review operations after
            five sessions without tuning the strategy.
          </li>
        </ol>
        <p className="mt-3 text-xs text-amber-200">
          Still to verify during market hours: exchange timestamps, matching
          OHLCV, bid/ask/depth and real account fee differences. The app
          calendar covers regular 2026 sessions only. Cash results do not
          validate futures or CE/PE trades.
        </p>
      </details>

      <div className={card}>
        <h3 className="font-semibold">
          {selected
            ? `Review scanner paper entry · ${selected}`
            : 'Review a scanner candidate'}
        </h3>
        <p className="mt-2 text-xs">
          This entry form always uses 3R v2. The results selector only changes
          the history being viewed.
        </p>
        {!selected && (
          <p className="mt-2 text-sm">
            Run a scan, then choose Review paper entry on a result. You can
            verify data even when the share does not yet qualify.
          </p>
        )}
        {selected && (
          <>
            <button
              className={`${button} mt-3`}
              disabled={scanBusy || busy}
              onClick={recheck}
            >
              Recheck selected share
            </button>
            <p className="mt-2 text-xs">
              A recheck refreshes data; it never records an entry. Check the
              current plan after it finishes.
            </p>
            {preview?.result?.plan && (
              <p className="mt-3 text-sm">
                Journal plan using remaining combined budget: ask{' '}
                {money(preview.result.plan.entry)} · quantity{' '}
                {preview.result.plan.quantity} · stop{' '}
                {money(preview.result.plan.stop)} · target{' '}
                {money(preview.result.plan.target)} · total risk{' '}
                {money(preview.result.plan.risk)} · net R:R{' '}
                {preview.result.plan.netRR.toFixed(3)} · planning fees{' '}
                {money(preview.result.plan.planningCharges)} plus slippage{' '}
                {money(
                  preview.result.plan.executionReserve ??
                    preview.config.slippage
                )}
              </p>
            )}
            <div className="mt-4 border-t border-slate-700 pt-3">
              <h4 className="font-semibold">
                1. Broker price and completed-candle comparison
              </h4>
              <button
                className={`${button} mt-2`}
                disabled={disabled || !context || scanBusy}
                onClick={capture}
              >
                Capture scanner comparison
              </button>
              {snapshot && (
                <>
                  <SnapshotTable snapshot={snapshot} />
                  <p className="mt-2 text-xs text-amber-200">
                    Read Angel One independently. Do not copy these app values
                    into the broker fields. If required timestamps are
                    unavailable, leave verification pending.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(
                      Object.keys(blankBroker) as (keyof typeof blankBroker)[]
                    ).map((key) => (
                      <Field
                        key={key}
                        label={brokerLabels[key]}
                        type={key.endsWith('Time') ? 'time' : 'number'}
                        value={broker[key]}
                        set={(v) => setBroker((b) => ({ ...b, [key]: v }))}
                      />
                    ))}
                  </div>
                  <button
                    className={`${button} mt-3`}
                    disabled={disabled}
                    onClick={saveComparison}
                  >
                    Save scanner comparison
                  </button>
                </>
              )}
              <p className="mt-2 text-xs">
                {comparison
                  ? comparison.passed
                    ? 'Scanner comparison matched today.'
                    : `Latest comparison failed: ${comparison.issues.join(' ')}`
                  : 'No saved scanner comparison for this share today.'}
              </p>
            </div>
            <div className="mt-4 border-t border-slate-700 pt-3">
              <h4 className="font-semibold">
                2. Verify fees for the journal plan
              </h4>
              <p className="mt-2 text-xs">
                Use{' '}
                <a
                  className="underline"
                  href="https://www.angelone.in/calculators/brokerage-calculator"
                  target="_blank"
                  rel="noreferrer"
                >
                  Angel One Equity → Intraday → NSE
                </a>
                . Calculate total round-trip charges at both stop and target for
                the displayed entry and quantity. These remain estimates. Do not
                enter brokerage alone.
              </p>
              {preview?.result?.plan && (
                <p className="mt-2 text-xs">
                  Published estimate: stop{' '}
                  {money(preview.result.plan.atStop.total)} · target{' '}
                  {money(preview.result.plan.atTarget.total)}. Higher broker
                  totals require extra charges in the scanner settings and
                  another recheck.
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field
                  label="Broker total charges at stop (₹)"
                  value={feeStop}
                  set={setFeeStop}
                />
                <Field
                  label="Broker total charges at target (₹)"
                  value={feeTarget}
                  set={setFeeTarget}
                />
              </div>
              <label className="mt-2 block text-xs">
                Fee source
                <select
                  className={input}
                  value={feeSource}
                  onChange={(e) =>
                    setFeeSource(e.target.value as typeof feeSource)
                  }
                >
                  <option value="BROKER_CALCULATOR">
                    Broker calculator estimate
                  </option>
                  <option value="ACCOUNT_TARIFF">
                    Account tariff applied to this trade
                  </option>
                </select>
              </label>
              <Field
                label="Fee source/reference and account differences"
                value={feeRef}
                set={setFeeRef}
                type="text"
              />
              <button
                className={`${button} mt-3`}
                disabled={disabled || scanBusy || !studyReady || !feeKey}
                onClick={saveFees}
              >
                Save scanner fee check
              </button>
              {preview?.fees && (
                <p className="mt-2 text-xs">
                  A fee check is saved for the current plan.
                </p>
              )}
            </div>
            <div className="mt-4 border-t border-slate-700 pt-3">
              <h4 className="font-semibold">
                3. Record an explicit paper entry
              </h4>
              <label className="mt-3 block text-xs">
                Event check and supervision notes
                <textarea
                  className={input}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <label className="mt-3 flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I checked scheduled events, costs and available time to
                supervise this paper position.
              </label>
              {(
                preview?.reasons || [
                  'Recheck this share and wait for a complete current scan.',
                ]
              ).map((r) => (
                <p className="mt-2 text-xs text-amber-200" key={r}>
                  {r}
                </p>
              ))}
              <button
                className={`${button} mt-3`}
                disabled={
                  disabled ||
                  !studyReady ||
                  scanBusy ||
                  !preview?.allowed ||
                  !reviewed ||
                  !notes.trim()
                }
                onClick={() =>
                  void action(async () => {
                    if (!context || document.hidden)
                      throw new Error(
                        'Keep the scanner visible and recheck before entry.'
                      );
                    await transact(
                      (b, s, fixed) =>
                        openScannerPosition(
                          b,
                          s,
                          fixed,
                          context,
                          notes,
                          reviewed
                        ),
                      true
                    );
                    setNotes('');
                    setReviewed(false);
                  }, 'Scanner paper entry saved at the observed ask. No broker order was sent.')
                }
              >
                Record scanner paper entry at ask
              </button>
            </div>
          </>
        )}
      </div>
      <div className={card}>
        <h3 className="font-semibold">
          Scanner observations and session notes
        </h3>
        <p className="mt-2 text-xs">
          New notes belong to 3R v2. The results selector controls which saved
          notes are shown.
        </p>
        <label className="mt-2 block text-xs">
          Skip reason, data gap, mistake or session review
          <textarea
            className={input}
            maxLength={2000}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className={button}
            disabled={disabled || !selected || !observation.trim()}
            onClick={() =>
              void action(async () => {
                await transact((b) =>
                  addScannerObservation(b, selected, observation)
                );
                setObservation('');
              }, 'Scanner observation saved; it is not a trade.')
            }
          >
            Save selected-share observation
          </button>
          <button
            className={button}
            disabled={disabled || !observation.trim()}
            onClick={() =>
              void action(async () => {
                await transact((b) =>
                  addScannerObservation(b, 'SESSION', observation)
                );
                setObservation('');
              }, 'Scanner session note saved.')
            }
          >
            Save scanner session note
          </button>
        </div>
        <details className="mt-3">
          <summary>
            Saved observations for selected version ·{' '}
            {versionBook.observations.length}
          </summary>
          {versionBook.observations
            .slice()
            .reverse()
            .map((o) => (
              <p className="mt-2 text-xs" key={o.id}>
                {displayTime(o.at)} · {o.symbol}: {o.reason}
              </p>
            ))}
        </details>
      </div>
      <div className={card}>
        <h3 className="font-semibold">
          Scanner trade history ·{' '}
          {historyVersion === SCANNER_3R_VERSION ? '3R v2' : '2R v1'} ·{' '}
          {versionBook.positions.length}
        </h3>
        {!versionBook.positions.length && (
          <p className="mt-2 text-sm">No scanner paper entries recorded.</p>
        )}
        {versionBook.positions
          .slice()
          .reverse()
          .map((p) => (
            <details className="mt-3 border-t border-slate-700 pt-2" key={p.id}>
              <summary>
                {p.setup.symbol} · {displayTime(p.enteredAt)} ·{' '}
                {isClosed(p)
                  ? `${p.exitReason} · net ${money(positionPL(p))}`
                  : 'OPEN'}
              </summary>
              <p className="mt-2 text-xs">
                {p.setup.version} · {p.quantity} shares · entry {money(p.entry)}{' '}
                · stop {money(p.setup.stop)} · target {money(p.setup.target)} ·
                planned risk {money(p.plannedRisk)}
              </p>
              {p.exitedAt && (
                <p className="mt-2 text-xs">
                  Exit {money(p.exit!)} at {displayTime(p.exitedAt)} · estimated
                  round-trip fees {money(p.charges!)} · {p.exitNotes}
                </p>
              )}
              <p className="mt-2 text-xs">Entry notes: {p.notes}</p>
              <p className="mt-2 text-xs">
                Captured strategy, quote, sizing, comparison and fee references
                are preserved in the scanner backup. Entries cannot be deleted
                to improve results.
              </p>
            </details>
          ))}
      </div>
      <div className={card}>
        <h3 className="font-semibold">Separate scanner backup and restore</h3>
        <p className="mt-2 text-xs">
          JSON backup includes both scanner versions and preserves old records.
          CSV exports only the selected results version. Keep the Practice
          backup separate.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={button}
            disabled={!ready}
            onClick={() =>
              downloadScannerFile(
                `scanner-journal-${istDateKey()}.json`,
                JSON.stringify(book, null, 2)
              )
            }
          >
            Export scanner backup
          </button>
          <button
            className={button}
            disabled={!ready}
            onClick={() =>
              downloadScannerFile(
                `scanner-trades-${historyVersion}-${istDateKey()}.csv`,
                scannerCSV(book, historyVersion),
                'text/csv'
              )
            }
          >
            Export scanner trades CSV
          </button>
          <button
            className={button}
            onClick={() =>
              void action(
                () =>
                  downloadScannerFile(
                    `scanner-raw-${istDateKey()}.json`,
                    localStorage.getItem(SCANNER_BOOK_KEY) || 'null'
                  ),
                'Raw scanner storage exported.'
              )
            }
          >
            Export raw scanner backup
          </button>
        </div>
        <p className="mt-2 text-xs">
          Restore merges matching scanner records only. Conflicting records and
          study backups are rejected. CSV is for analysis; JSON is the
          restorable backup.
        </p>
        <label className="mt-3 block text-xs">
          Choose scanner JSON backup
          <input
            className={input}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setIncoming(null);
              setReplaceUnreadable(false);
              if (file)
                void action(async () => {
                  if (file.size > 8_000_000)
                    throw new Error('Backup exceeds 8 MB.');
                  setIncoming(parseScannerBook(await file.text()));
                }, 'Backup validated. Review its counts, then merge.');
              e.target.value = '';
            }}
          />
        </label>
        {incoming && (
          <>
            <p className="mt-2 text-sm">
              Selected backup: {incoming.positions.length} entries,{' '}
              {incoming.comparisons.length} comparisons,{' '}
              {incoming.feeChecks.length} fee checks,{' '}
              {incoming.observations.length} notes.
            </p>
            {!ready && (
              <label className="mt-2 flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={replaceUnreadable}
                  onChange={(e) => setReplaceUnreadable(e.target.checked)}
                />
                I exported the unreadable raw scanner backup and want to replace
                it with this validated backup.
              </label>
            )}
            <button
              className={`${button} mt-3`}
              disabled={busy || !studyReady || (!ready && !replaceUnreadable)}
              onClick={() =>
                void action(async () => {
                  await journal.restore(incoming, replaceUnreadable);
                  setIncoming(null);
                }, 'Scanner backup restored. Study storage was not changed.')
              }
            >
              Merge scanner backup
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function ScannerOpenPosition({
  position: p,
  now,
  disabled,
  close,
}: {
  position: ScannerPosition;
  now: Date;
  disabled: boolean;
  close: (
    exit: number,
    fees: number,
    reason: ExitReason,
    at: string,
    notes: string
  ) => Promise<void>;
}) {
  const [quote, setQuote] = useState<PriceData | undefined>(),
    [feedError, setFeedError] = useState(''),
    [loading, setLoading] = useState(false);
  const [exit, setExit] = useState(''),
    [fees, setFees] = useState(''),
    [reason, setReason] = useState<ExitReason>('MANUAL'),
    [at, setAt] = useState(''),
    [notes, setNotes] = useState('');
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(false);
  async function refresh() {
    if (document.hidden || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setQuote(undefined);
    setFeedError('');
    try {
      const value = await fetchScannerQuote(p.setup.symbol, abort.signal);
      if (mounted.current && !abort.signal.aborted) setQuote(value);
    } catch (e) {
      if (mounted.current)
        setFeedError(e instanceof Error ? e.message : 'Quote unavailable.');
    } finally {
      if (controller.current === abort) controller.current = null;
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    document
      .getElementById('scanner-open-position')
      ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    if (isIndianMarketOpen()) void refresh();
    const timer = window.setInterval(() => {
      if (isIndianMarketOpen()) void refresh();
    }, 10000);
    const visibility = () => {
      if (document.hidden) controller.current?.abort();
      else if (isIndianMarketOpen()) void refresh();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
    // The position is immutable and this component is keyed by its ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);
  const problem = quoteProblem(quote, now),
    bid = !problem && Number(quote?.bid) > 0 ? Number(quote?.bid) : undefined;
  const timeDue = now.getTime() >= Date.parse(p.enteredAt) + 30 * 60000;
  const alert =
    bid !== undefined && bid <= p.setup.stop
      ? 'Stop reached — record the observed exit.'
      : bid !== undefined && bid >= p.setup.target
        ? 'Target reached — record the observed exit.'
        : timeDue
          ? '30-minute time exit due.'
          : 'Supervise this position; no automatic exit.';
  const estimate =
    Number(exit) > 0
      ? estimateCashCharges(p.entry, Number(exit), p.quantity).total
      : undefined;
  return (
    <div
      className="rounded-2xl border border-amber-700 bg-amber-950/20 p-4"
      id="scanner-open-position"
      aria-label="Open scanner paper position"
    >
      <h3 className="font-semibold">
        Open scanner paper position · {p.setup.symbol}
      </h3>
      <p className="mt-2 text-sm">
        {p.setup.version} · {p.quantity} shares at {money(p.entry)} · stop{' '}
        {money(p.setup.stop)} · target {money(p.setup.target)}
      </p>
      <p className="mt-2 text-xs">
        Entered {displayTime(p.enteredAt)} · time exit due{' '}
        {displayTime(new Date(Date.parse(p.enteredAt) + 1800000).toISOString())}
      </p>
      <p role="status" className="mt-2 font-semibold text-amber-200">
        {alert}
      </p>
      <p className="mt-2 text-xs">
        {feedError ||
          problem ||
          (bid === undefined
            ? 'Executable bid unavailable.'
            : `Current bid ${money(bid || 0)} · exchange ${displayTime(quote?.exchangeTime)}`)}
      </p>
      <button
        className={`${button} mt-2`}
        disabled={loading}
        onClick={() => void refresh()}
      >
        Refresh open-position quote
      </button>
      <p className="mt-2 text-xs">
        Keep this page visible. A closed/hidden tab cannot supervise stops. A
        quote touch is not a recorded fill. If the feed fails, use an
        independently observed Angel One bid and document the gap; never invent
        a historical fill.
      </p>
      <button
        className={`${button} mt-3`}
        disabled={bid === undefined || disabled}
        onClick={() => {
          if (
            !quote ||
            quoteProblem(quote, new Date()) ||
            !(Number(quote.bid) > 0)
          )
            return;
          setExit(String(quote.bid));
          setAt(new Date(Date.now() + 330 * 60000).toISOString().slice(0, 19));
          setFees(
            String(
              estimateCashCharges(p.entry, Number(quote.bid), p.quantity)
                .total +
                p.proof.config.roundingReserve +
                p.proof.config.extraCharges
            )
          );
        }}
      >
        Use current bid and time
      </button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field
          label="Observed scanner exit price (₹)"
          value={exit}
          set={setExit}
        />
        <Field
          label="Total estimated round-trip exit charges (₹)"
          value={fees}
          set={setFees}
        />
      </div>
      <Field
        label="Observed exit timestamp (IST)"
        type="datetime-local"
        value={at}
        set={setAt}
      />
      <p className="mt-1 text-xs">
        Enter the actual observed exit date/time in IST. Use current bid and
        time to fill it automatically. Late records must preserve the actual
        observation time.
      </p>
      {estimate !== undefined && (
        <p className="mt-2 text-xs">
          Published round-trip fee estimate at this exit: {money(estimate)}.
          Include applicable extra charges/rounding once; 3R exits enforce the
          saved rounding and extra-charge reserves. Do not subtract the original
          slippage reserve again from observed fill prices.
        </p>
      )}
      <label className="mt-2 block text-xs">
        Scanner exit reason
        <select
          className={input}
          value={reason}
          onChange={(e) => setReason(e.target.value as ExitReason)}
        >
          <option value="MANUAL">Manual / operational exit</option>
          <option value="STOP">Stop reached</option>
          <option value="TARGET">Target reached</option>
          <option value="TIME">30-minute time exit</option>
        </select>
      </label>
      <label className="mt-2 block text-xs">
        Exit source and supervision notes
        <textarea
          className={input}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button
        className={`${button} mt-3`}
        disabled={
          disabled || !exit.trim() || !fees.trim() || !at || !notes.trim()
        }
        onClick={() => void close(+exit, +fees, reason, `${at}+05:30`, notes)}
      >
        Record scanner paper exit
      </button>
    </div>
  );
}
