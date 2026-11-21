'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  createONGCDemo,
  DEMO_FIELDS,
  DEMO_ENTRY_TIME,
  DEMO_EXIT_TIME,
  DEMO_EXIT_BID,
  emptyDemoReadings,
  matchingDemoReadings,
  checkDemoReadings,
  checkDemoFees,
  checkDemoExit,
  demoExitCharges,
  type DemoReadings,
} from '@/lib/scannerDemo';
import { CHARGE_SCHEDULE } from '@/lib/brokerCharges';

const card = 'rounded-2xl border border-slate-700 bg-slate-900/60 p-4';
const input =
  'mt-1 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white disabled:opacity-50';
const button =
  'rounded-xl bg-indigo-700 px-4 py-3 text-sm font-semibold disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const secondary =
  'rounded-xl border border-indigo-400 px-3 py-2 text-sm disabled:opacity-40';
const money = (n: number) => `₹${n.toFixed(2)}`;

function Issues({ items }: { items: string[] }) {
  return items.length ? (
    <ul
      role="alert"
      className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-200"
    >
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : null;
}

export default function ScannerDemo() {
  const [attempt, setAttempt] = useState(0);
  return (
    <div className="space-y-5 pb-8">
      <header className="space-y-3">
        <Link
          href="/market#scanner-demo"
          className="text-sm text-teal-300 underline"
        >
          Leave demo and return to Scan
        </Link>
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">
          Demo only · fictional data
        </p>
        <h1 className="text-3xl font-bold">ONGC 3R practice demo</h1>
        <p className="text-sm leading-6 text-slate-300">
          Practise the Monday checklist with fictional 23 November 2026
          readings. The exercise clock advances with your steps, so you can
          practise outside market hours. This is not a current ONGC signal
          or an Angel One verification.
        </p>
        <p className="rounded-xl border border-indigo-700 bg-indigo-950/40 p-3 text-sm leading-6">
          Nothing is saved to either journal. Demo entries do not change
          your account limits, statistics, old trades or three-stock study.
          Refresh or Reset demo clears the exercise. No broker orders or
          live quotes.
        </p>
        <p className="text-xs text-amber-200">
          Use the demo when you have no open paper position to supervise.
          Return to Scan or Practice to manage existing positions.
        </p>
        <button
          className={secondary}
          onClick={() => setAttempt((n) => n + 1)}
        >
          Reset demo
        </button>
      </header>
      <DemoExercise key={attempt} />
    </div>
  );
}

function DemoExercise() {
  const [scenario] = useState(() => {
    try {
      return { demo: createONGCDemo(), error: '' };
    } catch (e) {
      return {
        demo: undefined,
        error: e instanceof Error ? e.message : 'Demo unavailable.',
      };
    }
  });
  const [captured, setCaptured] = useState(false);
  const [readings, setReadings] = useState(emptyDemoReadings);
  const [dataPassed, setDataPassed] = useState(false),
    [dataIssues, setDataIssues] = useState<string[]>([]);
  const [feeStop, setFeeStop] = useState(''),
    [feeTarget, setFeeTarget] = useState('');
  const [feesPassed, setFeesPassed] = useState(false),
    [feeIssues, setFeeIssues] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false),
    [entryNotes, setEntryNotes] = useState('');
  const [phase, setPhase] = useState<'review' | 'open' | 'closed'>(
    'review'
  );
  const [exit, setExit] = useState({
    price: '',
    time: '',
    fees: '',
    reason: '',
    notes: '',
  });
  const [exitIssues, setExitIssues] = useState<string[]>([]),
    [net, setNet] = useState(0);
  const exitHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (phase === 'open') {
      exitHeading.current?.focus();
      exitHeading.current?.scrollIntoView?.({
        block: 'start',
        behavior: 'smooth',
      });
    }
  }, [phase]);
  if (!scenario.demo)
    return (
      <p role="alert" className={card}>
        {scenario.error}
      </p>
    );
  const demo = scenario.demo,
    plan = demo.plan;
  const entryAllowed =
    phase === 'review' &&
    captured &&
    dataPassed &&
    feesPassed &&
    reviewed &&
    !!entryNotes.trim() &&
    plan.eligible;
  function changeReadings(next: DemoReadings) {
    setReadings(next);
    setDataPassed(false);
    setDataIssues([]);
    setFeesPassed(false);
    setFeeIssues([]);
  }
  function changeFees(stop: string, target: string) {
    setFeeStop(stop);
    setFeeTarget(target);
    setFeesPassed(false);
    setFeeIssues([]);
  }
  const clock =
    phase === 'closed'
      ? DEMO_EXIT_TIME
      : phase === 'open'
        ? DEMO_ENTRY_TIME
        : feesPassed
          ? '09:48:05'
          : dataPassed
            ? '09:47:00'
            : '09:45:05';
  return (
    <>
      <div className={card}>
        <p className="font-semibold">
          Exercise clock: {clock} IST · fictional Monday
        </p>
        <ol
          aria-label="Demo progress"
          className="mt-3 grid grid-cols-2 gap-2 text-sm"
        >
          <li>1. Data: {dataPassed ? 'matched' : 'pending'}</li>
          <li>2. Fees: {feesPassed ? 'checked' : 'pending'}</li>
          <li>3. Entry: {phase !== 'review' ? 'simulated' : 'pending'}</li>
          <li>4. Exit: {phase === 'closed' ? 'simulated' : 'pending'}</li>
        </ol>
        <p className="mt-3 text-xs text-slate-400">
          Assumed starting account ₹10,000, available cash ₹9,500, no
          earlier entries. ONGC is outside the example’s fixed study
          shares. This does not read your account.
        </p>
      </div>

      <section className={card} aria-labelledby="demo-data-title">
        <h2 id="demo-data-title" className="text-lg font-semibold">
          1. Compare fictional data
        </h2>
        <p className="mt-2 text-sm leading-6">
          Click Capture demo snapshot, then enter the fictional broker
          reference below. On Monday, read Angel One independently; never
          copy the app values to force a match.
        </p>
        <fieldset disabled={phase !== 'review'} className="mt-3 space-y-3">
          <legend className="sr-only">Demo data comparison</legend>
          <button
            className={button}
            onClick={() => {
              setCaptured(true);
              changeReadings(emptyDemoReadings());
            }}
          >
            Capture demo snapshot
          </button>
          {captured && (
            <>
              <div className="rounded-xl border border-slate-700 p-3 text-sm">
                <p className="font-semibold">
                  Captured app snapshot — fictional
                </p>
                <p className="mt-1">
                  Exchange 09:45:05 · LTP ₹200.00 · completed bar 09:40:00
                  IST.
                </p>
                <p>
                  Stock OHLC: 199.20 / 199.99 / 198.01 / 199.90. Volume:
                  15,000.
                </p>
                <p>NIFTY OHLC: 24,125 / 24,130 / 24,120 / 24,125.</p>
              </div>
              <div className="rounded-xl border border-indigo-800 p-3 text-sm leading-6">
                <p className="font-semibold">
                  Fictional broker reference — not live Angel One
                </p>
                <p>
                  LTP ₹200.00 · quote 09:45:07 · candle start 09:40:00 IST.
                </p>
                <p>
                  ONGC: open ₹199.20, high ₹199.99, low ₹198.01, close
                  ₹199.90; candle volume 15,000.
                </p>
                <p>
                  NIFTY spot: open 24,125, high 24,130, low 24,120, close
                  24,125.
                </p>
                <p>
                  Bid ₹199.98 · ask ₹200.00 · ask depth 1,000 shares · tick
                  ₹0.01.
                </p>
              </div>
              <p className="text-xs text-slate-300">
                The 09:45 candle is still forming. Use the completed 09:40
                candle’s volume, not cumulative daily volume.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={secondary}
                  onClick={() => changeReadings(matchingDemoReadings())}
                >
                  Load matching demo readings
                </button>
                <button
                  className={secondary}
                  onClick={() =>
                    changeReadings({
                      ...matchingDemoReadings(),
                      stockVolume: '14999',
                    })
                  }
                >
                  Try a volume mismatch
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {DEMO_FIELDS.map(([key, label, type]) => (
                  <label className="min-w-0 text-xs" key={key}>
                    {label}
                    <input
                      className={input}
                      type={type}
                      step={type === 'time' ? '1' : 'any'}
                      min={type === 'number' ? 0 : undefined}
                      value={readings[key]}
                      onChange={(e) =>
                        changeReadings({
                          ...readings,
                          [key]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className={button}
                onClick={() => {
                  const issues = checkDemoReadings(demo, readings);
                  setDataIssues(issues);
                  setDataPassed(!issues.length);
                  setFeesPassed(false);
                }}
              >
                Check demo data
              </button>
            </>
          )}
        </fieldset>
        <Issues items={dataIssues} />
        {dataPassed && (
          <p role="status" className="mt-3 text-sm text-teal-300">
            Demo data matched at simulated 09:47. This does not verify
            Angel One or count toward either study.
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="demo-fees-title">
        <h2 id="demo-fees-title" className="text-lg font-semibold">
          2. Verify the exact demo charges
        </h2>
        <p className="mt-2 text-sm leading-6">
          The 3R engine selects {plan.quantity} shares: entry{' '}
          {money(plan.entry)}, stop {money(plan.stop)}, target{' '}
          {money(plan.target)}. Purchase value{' '}
          {money(plan.entry * plan.quantity)}; no leverage.
        </p>
        <p className="mt-2 text-sm leading-6">
          In Angel One’s calculator, choose Equity → Intraday → NSE. Use
          buy ₹200 and 15 shares twice: sell at ₹198, then ₹206. Compare
          TOTAL TAXES AND CHARGES, not brokerage alone.
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt>Stop fee estimate</dt>
            <dd>{money(plan.atStop.total)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Target fee estimate</dt>
            <dd>{money(plan.atTarget.total)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Tax-rounding reserve</dt>
            <dd>{money(plan.taxReserve!)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Execution reserve</dt>
            <dd>{money(plan.executionReserve!)}</dd>
          </div>
          <div className="flex justify-between gap-3 font-semibold">
            <dt>Total planned risk</dt>
            <dd>{money(plan.risk)} / ₹50</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Planned net target reward</dt>
            <dd>{money(plan.reward)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Net reward/risk</dt>
            <dd>{plan.netRR.toFixed(3)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Cash including reserves</dt>
            <dd>{money(plan.cashRequired)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          These are app calculations using the{' '}
          <a
            className="text-teal-300 underline"
            href={CHARGE_SCHEDULE.source}
            target="_blank"
            rel="noreferrer"
          >
            published tariff
          </a>
          , not independent broker output or billed account evidence.
          Account charges still need verification. The 3R target is not
          ₹150 net profit.
        </p>
        {!dataPassed && (
          <p className="mt-3 text-sm text-amber-200">
            Match the demo data first.
          </p>
        )}
        <fieldset
          disabled={!dataPassed || phase !== 'review'}
          className="mt-3 space-y-3"
        >
          <legend className="sr-only">Demo fee comparison</legend>
          <div className="flex flex-wrap gap-2">
            <button
              className={secondary}
              onClick={() =>
                changeFees(
                  String(plan.atStop.total),
                  String(plan.atTarget.total)
                )
              }
            >
              Use demo fee estimates
            </button>
            <button
              className={secondary}
              onClick={() => changeFees('20', '20')}
            >
              Try higher fees (₹20)
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              Demo total charges at stop (₹)
              <input
                className={input}
                type="number"
                step="0.01"
                min="0"
                value={feeStop}
                onChange={(e) => changeFees(e.target.value, feeTarget)}
              />
            </label>
            <label className="text-xs">
              Demo total charges at target (₹)
              <input
                className={input}
                type="number"
                step="0.01"
                min="0"
                value={feeTarget}
                onChange={(e) => changeFees(feeStop, e.target.value)}
              />
            </label>
          </div>
          <button
            className={button}
            onClick={() => {
              const issues = checkDemoFees(demo, feeStop, feeTarget);
              setFeeIssues(issues);
              setFeesPassed(!issues.length);
            }}
          >
            Check demo fees
          </button>
        </fieldset>
        <Issues items={feeIssues} />
        {feesPassed && (
          <p role="status" className="mt-3 text-sm text-teal-300">
            Demo fee check passed. The larger estimate plus rounding and
            execution reserves fit ₹50. No fee evidence was saved.
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="demo-entry-title">
        <h2 id="demo-entry-title" className="text-lg font-semibold">
          3. Practise the paper entry
        </h2>
        <p className="mt-2 text-sm leading-6">
          Imagine Recheck selected share at 09:48:00: the same ask,
          quantity and plan remain valid. In the scanner, any changed
          entry, quantity or costs require a matching new fee check.
        </p>
        <p className="mt-2 text-sm leading-6">
          For a real paper entry, check company events, fresh bid/ask/depth
          and available supervision time. This exercise only rehearses
          those checks.
        </p>
        <fieldset disabled={phase !== 'review'} className="mt-3 space-y-3">
          <legend className="sr-only">Demo entry review</legend>
          <label className="block text-xs">
            Demo event and supervision notes
            <textarea
              className={input}
              maxLength={2000}
              value={entryNotes}
              onChange={(e) => setEntryNotes(e.target.value)}
              placeholder="Demo only: practising event review and 30-minute supervision."
            />
          </label>
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I have practised the event, cost and supervision review for
            this fictional example.
          </label>
          <button
            className={button}
            disabled={!entryAllowed}
            onClick={() => {
              if (entryAllowed) setPhase('open');
            }}
          >
            Simulate demo entry
          </button>
        </fieldset>
        {phase === 'review' && !entryAllowed && (
          <p className="mt-3 text-sm text-amber-200">
            Complete the matching data and fee checks, notes and review
            checkbox before the demo entry.
          </p>
        )}
        {phase !== 'review' && (
          <p role="status" className="mt-3 text-sm text-teal-300">
            Demo entry simulated at {DEMO_ENTRY_TIME} IST: 15 ONGC at ₹200,
            stop ₹198, target ₹206. Nothing was saved.
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="demo-exit-title">
        <h2
          ref={exitHeading}
          tabIndex={-1}
          id="demo-exit-title"
          className="scroll-mt-6 text-lg font-semibold"
        >
          4. Practise supervision and exit
        </h2>
        {phase === 'review' ? (
          <p className="mt-2 text-sm text-slate-300">
            Simulate the entry to unlock the fictional stop-loss exit.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6">
              Time exit would be due at 10:18:10 IST. In this scenario the
              bid reaches <strong>₹197.90 at 09:58:00</strong>, through the
              ₹198 stop. Stop reached is the correct reason; do not wait
              for the time limit.
            </p>
            <p className="mt-2 text-sm leading-6">
              In Scan, keep the position visible and supervise it. Alerts
              do not close it. If a feed fails, use an independently
              observed Angel One bid/time and document the gap.
            </p>
            <fieldset
              disabled={phase === 'closed'}
              className="mt-3 space-y-3"
            >
              <legend className="sr-only">Demo exit observation</legend>
              <button
                className={secondary}
                onClick={() => {
                  setExit((v) => ({
                    ...v,
                    price: String(DEMO_EXIT_BID),
                    time: DEMO_EXIT_TIME,
                    fees: String(demoExitCharges(demo)),
                  }));
                  setExitIssues([]);
                }}
              >
                Use demo bid, time and fees
              </button>
              <label className="block text-xs">
                Demo observed exit price (₹)
                <input
                  className={input}
                  type="number"
                  step="0.01"
                  min="0"
                  value={exit.price}
                  onChange={(e) =>
                    setExit((v) => ({ ...v, price: e.target.value }))
                  }
                />
              </label>
              <label className="block text-xs">
                Demo observed exit time (IST)
                <input
                  className={input}
                  type="time"
                  step="1"
                  value={exit.time}
                  onChange={(e) =>
                    setExit((v) => ({ ...v, time: e.target.value }))
                  }
                />
              </label>
              <label className="block text-xs">
                Demo total round-trip exit charges (₹)
                <input
                  className={input}
                  type="number"
                  step="0.01"
                  min="0"
                  value={exit.fees}
                  onChange={(e) =>
                    setExit((v) => ({ ...v, fees: e.target.value }))
                  }
                />
              </label>
              <p className="text-xs leading-5 text-slate-300">
                At least {money(demoExitCharges(demo))}: estimated
                buy-and-sell charges plus ₹1 rounding. The observed adverse
                price already affects P/L; do not subtract the original ₹5
                execution reserve again.
              </p>
              <label className="block text-xs">
                Demo exit reason
                <select
                  className={input}
                  value={exit.reason}
                  onChange={(e) =>
                    setExit((v) => ({ ...v, reason: e.target.value }))
                  }
                >
                  <option value="">Choose the observed reason</option>
                  <option value="STOP">Stop reached</option>
                  <option value="TARGET">Target reached</option>
                  <option value="TIME">30-minute time exit</option>
                  <option value="MANUAL">Manual / operational exit</option>
                </select>
              </label>
              <label className="block text-xs">
                Demo exit source and supervision notes
                <textarea
                  className={input}
                  maxLength={2000}
                  value={exit.notes}
                  onChange={(e) =>
                    setExit((v) => ({ ...v, notes: e.target.value }))
                  }
                  placeholder="Fictional bid ₹197.90 at 09:58; price moved through the stop."
                />
              </label>
              <button
                className={button}
                onClick={() => {
                  if (phase !== 'open') return;
                  const issues = checkDemoExit(demo, exit);
                  setExitIssues(issues);
                  if (!issues.length) {
                    setNet(
                      Math.round(
                        ((Number(exit.price) - plan.entry) *
                          plan.quantity -
                          Number(exit.fees)) *
                          100
                      ) / 100
                    );
                    setPhase('closed');
                  }
                }}
              >
                Simulate demo exit
              </button>
            </fieldset>
            <Issues items={exitIssues} />
          </>
        )}
        {phase === 'closed' && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-indigo-600 bg-indigo-950/40 p-4"
          >
            <h3 className="font-semibold">
              Demo complete — no journal records saved
            </h3>
            <p className="mt-2 text-sm">
              Gross loss: ₹31.50 · total estimated charges:{' '}
              {money(Number(exit.fees))}.
            </p>
            <p className="mt-2 text-xl font-bold">
              Net demo P/L: {net < 0 ? '−' : ''}
              {money(Math.abs(net))}
            </p>
            <p className="mt-2 text-sm leading-6">
              The standard example loses ₹45.36 against ₹48.90 planned
              risk. A larger adverse move or higher costs could exceed ₹50.
              This result is not performance evidence.
            </p>
            <p className="mt-2 text-sm leading-6">
              On a scanner entry day, no further entries are allowed in
              either journal. Log the session and export each journal
              separately. This demo consumes no entry allowance and has
              nothing to export or delete.
            </p>
            <p className="mt-2 text-sm">
              Use Reset demo above to practise again, or return to Scan for
              the Monday checklist.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
