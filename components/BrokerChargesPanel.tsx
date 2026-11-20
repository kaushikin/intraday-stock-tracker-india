'use client';
import { useMemo, useState } from 'react';
import {
  CHARGE_SCHEDULE,
  cashCostScenario,
  estimateCashCharges,
} from '@/lib/brokerCharges';
import { recordChargeCheck } from '@/lib/researchEvidence';
import type { PaperBook } from '@/lib/paperBook';
import { istDateKey } from '@/lib/marketHours';

type Props = {
  book: PaperBook;
  symbols: string[];
  ready: boolean;
  busy: boolean;
  riskBudget: number;
  cash: number;
  transact: (fn: (book: PaperBook) => PaperBook) => Promise<void>;
  action: (fn: () => Promise<void>, success: string) => Promise<void>;
};
const field =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white';
const money = (n: number) => `₹${n.toFixed(2)}`;
export default function BrokerChargesPanel({
  book,
  symbols,
  ready,
  busy,
  riskBudget,
  cash,
  transact,
  action,
}: Props) {
  const [values, setValues] = useState({
    entry: '200',
    stop: '196',
    target: '208',
    quantity: '9',
    slippage: '1',
    roundingReserve: '0.50',
  });
  const [source, setSource] = useState<'BROKER_CALCULATOR' | 'CONTRACT_NOTE'>(
      'BROKER_CALCULATOR'
    ),
    [exit, setExit] = useState('208'),
    [brokerTotal, setBrokerTotal] = useState(''),
    [reference, setReference] = useState(''),
    [tradeDate, setTradeDate] = useState(''),
    [notes, setNotes] = useState('');
  const result = useMemo(() => {
    try {
      if (Object.values(values).some((v) => !v.trim()))
        throw new Error('Complete every calculation field.');
      return {
        scenario: cashCostScenario({
          entry: Number(values.entry),
          stop: Number(values.stop),
          target: Number(values.target),
          quantity: Number(values.quantity),
          slippage: Number(values.slippage),
          roundingReserve: Number(values.roundingReserve),
          riskBudget,
          cash,
        }),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid calculation.' };
    }
  }, [values, riskBudget, cash]);
  let comparisonEstimate: number | undefined;
  try {
    if (exit.trim())
      comparisonEstimate = estimateCashCharges(
        Number(values.entry),
        Number(exit),
        Number(values.quantity)
      ).total;
  } catch {}
  const last = book.research?.chargeChecks.at(-1);
  async function save() {
    await action(
      () =>
        transact((latest) =>
          recordChargeCheck(
            latest,
            symbols,
            {
              source,
              reference,
              tradeDate: tradeDate || istDateKey(),
              entry: Number(values.entry),
              exit: Number(exit),
              quantity: Number(values.quantity),
              brokerTotal: Number(brokerTotal),
              notes,
            },
            new Date()
          )
        ),
      'Broker charge comparison saved as your observation. Published rates and actual account charges remain distinct.'
    );
  }
  return (
    <details className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
      <summary className="cursor-pointer font-semibold">
        Broker charges ·{' '}
        {last ? 'comparison recorded' : 'your charges unverified'}
      </summary>
      <p className="mt-3 text-sm text-slate-300">
        Standard Angel One NSE intraday rates checked{' '}
        {CHARGE_SCHEDULE.reviewedAt}. Your account plan and contract-note
        charges have not been independently verified.
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Hypothetical calculator, not a trading signal. One buy order and one
        sell order, no leverage. Compare exact quantity and prices with the
        broker before using the amount in the entry checklist.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {(Object.keys(values) as (keyof typeof values)[]).map((key) => (
          <label key={key} className="text-xs text-slate-300">
            {
              {
                entry: 'Entry price (₹)',
                stop: 'Stop price (₹)',
                target: 'Target price (₹)',
                quantity: 'Quantity (shares)',
                slippage: 'Slippage allowance (₹)',
                roundingReserve: 'Tax-rounding reserve (₹)',
              }[key]
            }
            <input
              className={field}
              type="number"
              step={key === 'quantity' ? '1' : '0.01'}
              min="0"
              value={values[key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [key]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      {result.error && (
        <p className="mt-3 text-sm text-amber-300">{result.error}</p>
      )}
      {result.scenario && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="mb-2 text-left text-slate-400">
                Estimated round-trip charges (before reserves)
              </caption>
              <thead>
                <tr>
                  <th className="py-2">Charge</th>
                  <th>Stop exit</th>
                  <th>Target exit</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    'brokerage',
                    'exchange',
                    'ipft',
                    'sebi',
                    'stt',
                    'stamp',
                    'gst',
                    'total',
                  ] as const
                ).map((key) => (
                  <tr key={key} className="border-t border-slate-800">
                    <th className="py-2 font-normal">
                      {
                        {
                          brokerage: 'Brokerage',
                          exchange: 'Exchange',
                          ipft: 'IPFT',
                          sebi: 'SEBI',
                          stt: 'STT',
                          stamp: 'Stamp duty',
                          gst: 'GST',
                          total: 'Total',
                        }[key]
                      }
                    </th>
                    <td>{money(result.scenario!.atStop[key])}</td>
                    <td>{money(result.scenario!.atTarget[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Line items display two decimals; the total uses unrounded fees and
            rounds upward to a paisa. Actual tax/day-level rounding can differ.
            Keep the reserve until reconciled.
          </p>
          <div className="mt-3 rounded-lg bg-slate-950 p-3 text-sm">
            <p className="font-semibold">
              {result.scenario.eligible
                ? 'Fits these cost assumptions only'
                : 'Does not fit this budget / net R:R'}
            </p>
            <p className="mt-2">
              Planning charges including rounding reserve:{' '}
              {money(result.scenario.planningCharges)}
            </p>
            <p>
              Total risk: {money(result.scenario.risk)} / {money(riskBudget)}
            </p>
            <p>
              Net target reward: {money(result.scenario.reward)} · net R:R{' '}
              {result.scenario.netRR.toFixed(3)}
            </p>
            <p>Cash including costs: {money(result.scenario.cashRequired)}</p>
            {result.scenario.reasons.map((reason) => (
              <p className="mt-1 text-amber-300" key={reason}>
                {reason}
              </p>
            ))}
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Excludes extra orders, delivery/DP fees, call-and-trade fees, account
        charges and account-specific offers or caps. Use the higher verified
        costs if your broker charges more. Never lower costs or enlarge risk to
        make a trade fit.
      </p>
      <p className="mt-2 text-xs">
        <a
          href={CHARGE_SCHEDULE.source}
          target="_blank"
          rel="noreferrer"
          className="text-teal-300 underline"
        >
          Angel One published tariff
        </a>{' '}
        ·{' '}
        <a
          href={CHARGE_SCHEDULE.exchangeSource}
          target="_blank"
          rel="noreferrer"
          className="text-teal-300 underline"
        >
          NSE transaction/IPFT circular
        </a>
      </p>
      <h3 className="mt-5 font-semibold">Reconcile with your broker</h3>
      <p className="mt-2 text-xs text-slate-400">
        Use an existing contract note or the broker’s calculator; no real trade
        is needed. Enter the same entry price and quantity above. This saves a
        self-reported comparison, not an imported broker statement.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs">
          Source
          <select
            className={field}
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
          >
            <option value="BROKER_CALCULATOR">Broker calculator</option>
            <option value="CONTRACT_NOTE">Contract note</option>
          </select>
        </label>
        <label className="text-xs">
          Trade / estimate date
          <input
            type="date"
            className={field}
            min="2026-03-01"
            max={istDateKey()}
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Broker exit price (₹)
          <input
            className={field}
            type="number"
            min="0"
            step="0.01"
            value={exit}
            onChange={(e) => setExit(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Broker total charges (₹)
          <input
            className={field}
            type="number"
            min="0"
            step="0.01"
            value={brokerTotal}
            onChange={(e) => setBrokerTotal(e.target.value)}
          />
        </label>
      </div>
      {comparisonEstimate !== undefined && (
        <p className="mt-2 text-xs text-slate-400">
          Published-tariff estimate for this comparison:{' '}
          {money(comparisonEstimate)}. Excludes the separate planning reserves.
        </p>
      )}
      <label className="mt-3 block text-xs">
        Private reference (a short label is enough)
        <input
          className={field}
          maxLength={160}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <label className="mt-3 block text-xs">
        Charge discrepancy / account-plan notes
        <textarea
          className={field}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button
        className="mt-3 rounded-xl bg-teal-700 px-4 py-2 text-sm disabled:opacity-40"
        disabled={
          !ready ||
          busy ||
          !brokerTotal.trim() ||
          !reference.trim() ||
          !tradeDate ||
          comparisonEstimate === undefined ||
          !symbols.length
        }
        onClick={save}
      >
        Save charge comparison
      </button>
      {last && (
        <p className="mt-3 text-xs text-slate-300">
          Latest saved comparison: {last.source.replaceAll('_', ' ')} ·{' '}
          {last.tradeDate} · broker {money(last.brokerTotal)} vs estimate{' '}
          {money(last.estimatedTotal)} · difference {money(last.difference)}.{' '}
          {Math.abs(last.difference) > 0.5
            ? 'Needs review; this is more than ₹0.50 apart.'
            : 'Within ₹0.50; still check each new order’s quantity and costs.'}
        </p>
      )}
    </details>
  );
}
