import { ShieldAlert, BellOff } from 'lucide-react';
import { COMMODITY_WATCH } from '@/lib/commodityWatch';
import {
  COMMODITY_REVIEW as review,
  COMMODITY_SPECS,
  commodityAlertReadiness,
} from '@/lib/commodityValidation';

const rupees = (n: number) =>
  `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

export default function CommodityValidationPanel() {
  return (
    <section
      className="scanner-card space-y-5"
      aria-label="Commodity strategy validation"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
            Feasibility check · 23 Nov 2026
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            This plan does not fit standard commodity lots
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
            This dated review covers standard crude, copper and gold under the
            initial ₹10,000 plan. Gold Petal has a separate paper pilot with its
            own limits.{' '}
            Buy alerts are blocked. The calculation below fails the daily budget
            before a trading strategy can qualify. No commodity strategy has
            passed performance validation.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-950/50 p-4">
          <p className="text-xs text-slate-400">Capital · no leverage</p>
          <p className="mt-1 text-lg font-semibold">{rupees(review.capital)}</p>
        </div>
        <div className="rounded-xl bg-slate-950/50 p-4">
          <p className="text-xs text-slate-400">Existing trade-risk ceiling</p>
          <p className="mt-1 text-lg font-semibold">
            {rupees(review.existingTradeRisk)} incl. costs
          </p>
        </div>
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
          <p className="text-xs text-amber-200">
            Requested total daily loss ceiling
          </p>
          <p className="mt-1 text-lg font-semibold">
            {rupees(review.dailyLossCeiling)} incl. costs
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Planning limit · monitoring not active
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {COMMODITY_WATCH.map(({ symbol, name }) => {
          const spec = COMMODITY_SPECS[symbol];
          const check = commodityAlertReadiness(symbol);
          return (
            <article
              key={symbol}
              className="min-w-0 rounded-xl border border-slate-700/60 p-4"
            >
              <h3 className="font-semibold">{name} · one standard lot</h3>
              <p className="mt-1 text-xs text-slate-400">{spec.lot}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>One-tick stop</dt>
                  <dd>{rupees(check.stopLoss)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Two ticks for slippage</dt>
                  <dd>{rupees(check.slippageAllowance)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Brokerage + its GST</dt>
                  <dd>{rupees(check.brokerageWithGST)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-700/60 pt-3 font-semibold text-amber-200">
                  <dt>Risk floor</dt>
                  <dd>{rupees(check.riskFloor)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Other charges add more. A one-tick stop is a feasibility
                illustration, not a recommended trading stop.
              </p>
              <p className="mt-3 text-xs font-semibold text-amber-200">
                BUY BLOCKED · exceeds ₹250 daily ceiling
              </p>
              <a
                href={spec.source}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs text-teal-300 underline"
              >
                MCX contract specification ↗
              </a>
              <p className="mt-1 text-xs text-slate-500">
                {spec.appliesTo}. Recheck specifications on rollover.
              </p>
            </article>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-700/60 p-4 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <BellOff className="h-4 w-4 text-slate-400" />
          Exit alerts are not active
        </div>
        <p className="mt-2 leading-relaxed text-slate-300">
          This page does not track commodity positions, stops or account-wide
          losses. Manual price snapshots cannot provide continuous exit
          monitoring. There is no automatic exit order or guaranteed ₹250 loss
          cap; a stop can fill beyond its planned price.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          ₹250 means the whole day, not each trade or an extra commodity
          allowance. A remaining daily balance is not available here. Existing
          stock limits, both journals and the three-stock study stay unchanged.
        </p>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-teal-300">
          How this was checked and what is still needed
        </summary>
        <div className="mt-3 space-y-3 leading-relaxed text-slate-300">
          <p>
            The floor assumes one entry and one exit at normal ₹20 brokerage per
            order, 18% GST on brokerage, and an allowance of one tick of
            slippage on each side. It excludes additional CTT, stamp duty,
            exchange fees, SEBI fees and applicable GST. Those costs must be
            added to any future trading plan; no promotional discounts are
            assumed. Slippage may exceed this allowance.
          </p>
          <p>
            Full contract exposure is quoted price × 100 for crude, × 2,500 for
            copper, and × 100 for gold. The quote is not the price of one lot.
            Broker margin is not a substitute for the ₹10,000 no-leverage
            funding rule.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              First find a contract that fits funding and a meaningful stop plus
              all costs. Smaller contracts need their own review; none are
              substituted here.
            </li>
            <li>
              Verify the exact expiry, completed MCX candles, bid/ask spread and
              the account tariff against Angel One.
            </li>
            <li>
              Define and freeze entry, stop, target, time-exit, expiry and event
              rules. Test them on unseen data with realistic fills, then
              forward-test in a separate commodity research record.
            </li>
            <li>
              Before enabling alerts, add position tracking, combined daily loss
              and open-risk accounting, stale-feed handling and reliable
              monitoring. Software tests alone cannot establish a profitable
              strategy or a 70% win rate.
            </li>
          </ol>
          <a
            href={review.tariff}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-teal-300 underline"
          >
            Angel One published commodity charges ↗
          </a>
        </div>
      </details>
    </section>
  );
}
