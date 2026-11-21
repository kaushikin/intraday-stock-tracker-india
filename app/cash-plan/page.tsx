import Link from 'next/link';
import { CHARGE_SCHEDULE } from '@/lib/brokerCharges';
import { evaluateCash3RPlan } from '@/lib/cashPlan';

const money = (n: number) => `₹${n.toFixed(2)}`;
const example = {
  entry: 200,
  stop: 198,
  quantity: 15,
  spread: 0.05,
  tickSize: 0.05,
};
const cases = [
  { label: 'Base illustration', ...example },
  {
    label: '₹5,000 position; 0.5% stop and 1.5% target',
    entry: 500,
    stop: 497.5,
    quantity: 10,
    spread: 0.05,
    tickSize: 0.05,
  },
  { label: 'Execution reserve rises to ₹8', ...example, measuredSlippage: 8 },
  {
    label: 'Two fewer shares with that ₹8 reserve',
    ...example,
    quantity: 13,
    measuredSlippage: 8,
  },
];
const rules = [
  [
    'Total planned risk',
    'Keep the smaller of ₹50, 0.5% of equity and remaining shared loss headroom. All costs stay inside it.',
  ],
  [
    'Capital and position value',
    '₹10,000 equity, ₹9,500 available cash including costs. Position-value ceiling ₹5,000; whole shares only, no leverage.',
  ],
  [
    'Target: 3R',
    '3× the original chart stop distance instead of 2×. Keep minimum net reward/risk 1.2. Skip if known resistance obstructs the full target; do not move the stop or invent room.',
  ],
  [
    'Execution reserve',
    'At least the largest of ₹5, two spreads × quantity, two ticks × quantity, and the observed adverse-fill allowance. Keep at least ₹1 for tax rounding plus any extra charges. These are provisional floors, not certified execution costs.',
  ],
  [
    'Execution filter',
    'Keep observed spread within 10% of chart stop distance. Change the combined spread-cost plus execution-reserve ceiling from 10% to 25% of gross stop risk. The old filter cannot accommodate the ₹5 reserve within ₹50 total risk.',
  ],
  [
    'Keep the setup and exits',
    'Completed five-minute pullback, stock/NIFTY trend confirmation, fresh bid/ask, sufficient depth, no chasing, 09:45–11:15 entries. Whole-position stop, target or 30-minute time exit. Never extend the exit to wait for 3R.',
  ],
  [
    'Research discipline',
    'One entry per day, one open position across journals. Keep ₹100 daily, ₹250 weekly and ₹500 monthly/drawdown limits. No daily profit quota.',
  ],
];

export default function CashPlanPage() {
  const plan = evaluateCash3RPlan(example);
  return (
    <div className="space-y-5 pb-12">
      <header>
        <p className="text-xs uppercase tracking-widest text-amber-300">
          Active scanner version · paper research only
        </p>
        <h1 className="mt-2 text-3xl font-bold">₹10,000 cash plan</h1>
        <p className="mt-3 text-sm text-slate-300">
          Keep ₹50 total planned risk and full costs. A wider target can make
          the arithmetic feasible; it does not establish profitability or a 70%
          win rate.
        </p>
      </header>
      <section className="rounded-2xl border border-amber-700 bg-amber-950/20 p-4">
        <h2 className="font-semibold">
          3R scanner active; old studies preserved
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          New Scan entries use scanner-cash-3r-v2. The three-share Practice
          study keeps its 2R rules; old scanner records remain in the 2R v1
          history selector with separate results. These examples do not save
          trades. Refresh all app tabs before using the new version.
        </p>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="font-semibold">Active 3R rules</h2>
        <dl className="mt-3 space-y-4 text-sm">
          {rules.map(([label, value]) => (
            <div key={label}>
              <dt className="font-semibold text-teal-200">{label}</dt>
              <dd className="mt-1 text-slate-300">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <h2 className="font-semibold">
          One arithmetic example — no stock recommendation
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          15 shares at ₹200, chart stop ₹198, 3R target ₹206. Assumed tick and
          spread ₹0.05 each. Purchase value ₹3,000; cash including cost reserves{' '}
          {money(plan.cashRequired)}.
        </p>
        <p className="mt-2 text-sm text-slate-300">
          Stop-side fees {money(plan.atStop.total)}; target-side fees{' '}
          {money(plan.atTarget.total)}. Reserve the larger amount, plus ₹1 tax
          rounding and ₹5 execution allowance. Planned loss {money(plan.risk)};
          net target profit {money(plan.reward)}; net reward/risk{' '}
          {plan.netRR.toFixed(3)}.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          The 3% target move is an illustration, not a forecast. Actual
          completed candles, resistance, depth, events and fills have not been
          verified.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <caption className="mb-2 text-left text-slate-300">
              Cost stress checks — smaller quantity does not always solve an
              expensive setup
            </caption>
            <thead>
              <tr>
                <th className="py-2">Case</th>
                <th>Planned risk</th>
                <th>Net target</th>
                <th>Cost rules</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(({ label, ...input }) => {
                const result = evaluateCash3RPlan(input);
                return (
                  <tr key={label} className="border-t border-slate-800">
                    <th className="py-3 pr-2 font-normal">{label}</th>
                    <td>{money(result.risk)}</td>
                    <td>{money(result.reward)}</td>
                    <td
                      className={
                        result.costFeasible ? 'text-teal-300' : 'text-amber-300'
                      }
                    >
                      {result.costFeasible ? 'Fits illustration' : 'Skip'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-sm">
        <h2 className="font-semibold">Before your first 3R paper entry</h2>
        <p className="mt-2 text-slate-300">
          Verify the exact account tariff and quantities against Angel One.
          During five supervised sessions, compare feeds and record candidate
          spread, available depth, target room, costs and skipped opportunities.
          Price observations are not real fills. If the actual reserve must be
          larger, use it and recalculate or skip.
        </p>
        <p className="mt-2 text-slate-300">
          Start the new 3R paper sample only after the broker data and fee
          checks pass. Review at least 100 closed entries across at least 50
          entry sessions; at one entry per day, 100 trades actually require at
          least 100 entry sessions, often longer with no-trade days. Include
          time/manual exits, all losses, net expectancy and drawdown. Do not
          promise a 70% win rate or force entries to reach a sample count.
        </p>
        <p className="mt-2 text-amber-200">
          ₹50 is a planned loss limit. An ordinary stop cannot guarantee the
          final loss during gaps, poor fills or outages. If ₹50 is an absolute
          maximum you cannot exceed, stay with paper trading.
        </p>
      </section>
      <p className="text-xs text-slate-400">
        Standard tariff checked {CHARGE_SCHEDULE.reviewedAt}. Regulatory
        brokerage caps are included; account-specific billing remains to be
        reconciled.
      </p>
      <div className="flex flex-wrap gap-4 text-sm text-teal-300 underline">
        <a href={CHARGE_SCHEDULE.source} target="_blank" rel="noreferrer">
          Angel One tariff
        </a>
        <a
          href={CHARGE_SCHEDULE.brokerageCapSource}
          target="_blank"
          rel="noreferrer"
        >
          SEBI brokerage ceiling
        </a>
        <Link href="/market">Return to Scan</Link>
        <Link href="/signals">Practice and charge calculator</Link>
      </div>
    </div>
  );
}
