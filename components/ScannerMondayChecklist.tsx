import Link from 'next/link';
import type { ReactNode } from 'react';

const link =
  'text-teal-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4';

function Step({
  number,
  time,
  title,
  children,
}: {
  number: number;
  time: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li>
      <details
        className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:p-4"
        open={number === 1}
      >
        <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
          {number}. {title}
          <span className="mt-1 block pl-5 text-xs font-normal text-slate-400">
            {time} · IST
          </span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
          {children}
        </div>
      </details>
    </li>
  );
}

export default function ScannerMondayChecklist({
  hasCandidate,
}: {
  hasCandidate: boolean;
}) {
  const candidateLink = (section: string) =>
    hasCandidate ? `#scanner-${section}` : '#scanner-review';
  return (
    <section
      id="scanner-monday-checklist"
      aria-labelledby="scanner-monday-title"
      className="scroll-mt-6 rounded-2xl border border-teal-800 bg-teal-950/20 p-4 sm:p-5"
    >
      <h2 id="scanner-monday-title" className="text-xl font-semibold">
        Monday checklist · 3R scanner
      </h2>
      <p className="mt-2 text-sm text-slate-300">
        Follow these steps for one supervised paper session. Expand a step
        for instructions, then use its link to reach the form. The saved
        data and fee checks below determine entry readiness; reading this
        guide does not record a trade.
      </p>
      <p className="mt-2 text-sm text-amber-200">
        Keep the three-stock study in Practice. A 3R entry requires no
        earlier entry in either journal today and uses today’s shared entry
        allowance. A documented no-trade session is valid.
      </p>
      <nav
        aria-label="Scanner checklist shortcuts"
        className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-sm"
      >
        <a className={link} href="#scanner-run">
          Scan
        </a>
        <a className={link} href={candidateLink('comparison')}>
          Data comparison
        </a>
        <a className={link} href={candidateLink('fees')}>
          Fees
        </a>
        <a className={link} href={candidateLink('entry')}>
          Entry
        </a>
        <a className={link} href="#scanner-exit">
          Exit
        </a>
        <a className={link} href="#scanner-notes">
          Session notes
        </a>
        <a className={link} href="#scanner-backup">
          Backups
        </a>
      </nav>
      <p className="mt-3 text-sm">
        <Link className={link} href="/market/demo">
          Rehearse these steps in the isolated ONGC demo
        </Link>
        {' '}— fictional readings, no saved journal records.
      </p>
      <ol className="mt-5 space-y-3" aria-label="Monday scanner steps">
        <Step
          number={1}
          time="08:50"
          title="Open the app and protect your records"
        >
          <p>
            Use the same browser, device and app URL that hold your
            journals. Refresh all open app tabs. Confirm “Nifty 50 scanner
            · 3R” and select “3R v2 — active paper sample” under Scanner
            results version.
          </p>
          <p>
            Export the scanner JSON backup. In Practice, confirm your
            existing three study shares and export its separate journal
            backup. Keep those shares unchanged and leave Practice entries
            unused on this scanner entry day. Observations can still be
            recorded separately.
          </p>
          <p>
            Open Angel One and its calculator. Journals are stored in this
            browser; GitHub and Vercel do not synchronize them.
          </p>
          <p>
            <a className={link} href="#scanner-journal">
              Results version
            </a>
            {' · '}
            <a className={link} href="#scanner-backup">
              Scanner backup
            </a>
            {' · '}
            <Link className={link} href="/signals">
              Practice study and backup
            </Link>
          </p>
        </Step>
        <Step
          number={2}
          time="09:00"
          title="Check your Angel One account charges"
        >
          <p>
            In Angel One, open Account → Trades &amp; Charges. Compare an
            existing NSE cash intraday transaction or contract note using
            its exact buy price, sell price and quantity. Check any
            account-specific tariff. The scanner models one buy order and
            one sell order.
          </p>
          <p>
            Full billed charges can take 1–2 working days to appear.
            Without a comparable transaction, use the broker calculator and
            label the evidence an estimate. No real trade is needed for
            this check; paper trades do not generate contract notes.
          </p>
          <p>
            <a
              className={link}
              href="https://www.angelone.in/support/charges-and-cashbacks/brokerage-charges"
              target="_blank"
              rel="noreferrer"
            >
              Angel One account charges guidance
            </a>
            {' · '}
            <a
              className={link}
              href="https://www.angelone.in/calculators/brokerage-calculator"
              target="_blank"
              rel="noreferrer"
            >
              Open broker calculator
            </a>
          </p>
        </Step>
        <Step
          number={3}
          time="09:15–09:40"
          title="Confirm the ₹50 budget and realistic reserves"
        >
          <ul className="list-disc space-y-1 pl-5">
            <li>Total risk budget: at most ₹50, including all costs.</li>
            <li>
              Available cash: at most ₹9,500, reduced by the shared account
              if needed.
            </li>
            <li>
              Execution reserve floor: at least ₹5; keep any higher
              spread/tick-based reserve.
            </li>
            <li>Tax-rounding reserve: at least ₹1.</li>
            <li>
              Extra round-trip charges: any verified costs above the
              standard estimate.
            </li>
          </ul>
          <p>
            Standard broker charges are already calculated. The app caps
            purchase value at ₹5,000, uses whole shares and assumes no
            leverage. Never reduce costs to make a stock qualify.
          </p>
          <a className={link} href="#scanner-budget">
            Review budget and cost assumptions
          </a>
        </Step>
        <Step
          number={4}
          time="09:45–11:15"
          title="Scan Nifty 50 and review one candidate"
        >
          <p>
            Click Scan Nifty 50 and keep the tab visible until it finishes.
            Allow a few minutes. On a candidate outside your fixed
            three-stock study, choose Review paper entry, then Recheck
            selected share.
          </p>
          <p>
            The ranking uses estimated net reward/risk and spread, not win
            probability. If nothing qualifies, read the exclusions and save
            a session note. Outside the entry window, Check Nifty 50 feeds
            only checks data; it cannot approve an entry.
          </p>
          <a className={link} href="#scanner-run">
            Go to scanner controls
          </a>
        </Step>
        <Step
          number={5}
          time="Before entry"
          title="Compare data independently with Angel One"
        >
          <p>
            Open the same NSE cash share and NIFTY 50 spot index in Angel
            One, using standard five-minute candles and IST. Click Capture
            scanner comparison, then independently enter these broker
            values:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Stock LTP and its exchange/feed quote timestamp.</li>
            <li>
              The exact completed candle’s start time and stock open, high,
              low, close and candle volume.
            </li>
            <li>
              NIFTY open, high, low and close for that same candle
              interval.
            </li>
          </ul>
          <p>
            Just after 09:45, the completed bar normally starts at 09:40;
            the 09:45 bar is still forming. Use candle volume, not daily
            cumulative volume. Compare current bid, ask and depth too: the
            ask depth must cover the proposed quantity.
          </p>
          <p>
            Save within five minutes using Save scanner comparison. Look
            for “Scanner comparison matched today.” Missing timestamps,
            stale data or mismatched completed candles leave verification
            pending. Do not copy app values into broker fields. A later
            failed comparison requires a fresh passing check.
          </p>
          <a className={link} href={candidateLink('comparison')}>
            Go to data comparison
          </a>
        </Step>
        <Step
          number={6}
          time="Before entry"
          title="Verify stop and target charges for the final quantity"
        >
          <p>
            Use “Journal plan using remaining combined budget,” whose
            quantity can differ from the shortlist. In the Angel One
            calculator choose Equity → Intraday → NSE. Use the journal
            entry ask and quantity for both calculations: first sell at the
            stop, then sell at the target.
          </p>
          <p>
            Enter TOTAL TAXES AND CHARGES, including brokerage, in Broker
            total charges at stop and Broker total charges at target.
            Select the fee source, add the date/reference and account
            differences, then click Save scanner fee check. Do not enter
            brokerage alone or net P/L.
          </p>
          <p>
            Higher broker totals require higher Extra round-trip charges
            and another recheck. Keep the rounding and execution reserves.
            If the entry, quantity or cost plan changes, calculate and save
            a new fee check for that exact plan.
          </p>
          <a className={link} href={candidateLink('fees')}>
            Go to fee verification
          </a>
        </Step>
        <Step
          number={7}
          time="09:45–11:15 only"
          title="Recheck and explicitly record the paper entry"
        >
          <p>
            Recheck selected share immediately before entry; repeat fee
            verification if the plan changed. Confirm fresh data, today’s
            matching comparison, a valid unexpired setup, sufficient
            cash/depth, total planned risk within the remaining budget (at
            most ₹50), and net reward/risk of at least 1.2. Follow the
            app’s eligibility result.
          </p>
          <p>
            Check scheduled company events and your available supervision
            time. Fill Event check and supervision notes, tick the review
            checkbox, then click Record scanner paper entry at ask. Confirm
            the open position shows quantity, entry, stop, target and
            time-exit deadline. No Angel One order is sent.
          </p>
          <p>
            The 3R target is based on the original trigger-to-stop
            distance; it does not mean ₹150 net profit. A later ask does
            not move the stop or target. A disabled entry button means the
            listed blocks still need resolving, or this setup must be
            skipped.
          </p>
          <a className={link} href={candidateLink('entry')}>
            Go to paper entry
          </a>
        </Step>
        <Step
          number={8}
          time="From entry until exit"
          title="Supervise the open position"
        >
          <p>
            Keep Scan visible and Angel One available. Set a timer for the
            displayed 30-minute deadline. Exit at the first applicable
            stop, target or time limit. Keep the original levels and do not
            extend the holding period to wait for a winner.
          </p>
          <p>
            Alerts do not close a paper position. A hidden tab or sleeping
            device cannot supervise stops. If the app feed fails, use an
            independently observed Angel One bid/time and document the gap.
          </p>
          <a className={link} href="#scanner-exit">
            Go to open position and exit
          </a>
        </Step>
        <Step
          number={9}
          time="At the observed exit"
          title="Record the exit price, time and full costs"
        >
          <p>
            With a fresh quote, click Use current bid and time. Compare the
            bid with Angel One and review the IST timestamp. Choose Stop
            reached, Target reached, 30-minute time exit, or Manual /
            operational exit.
          </p>
          <p>
            Review Total estimated round-trip exit charges: this covers
            both entry and exit, including saved rounding and extra-charge
            allowances. Increase it for higher verified costs. Do not
            deduct the original execution reserve again from observed
            prices.
          </p>
          <p>
            Add Exit source and supervision notes and click Record scanner
            paper exit. Confirm the closed history and net P/L. If price
            jumped through the stop, record the observed bid rather than
            assuming a stop-price fill. Never invent a missed historical
            fill. ₹50 is a planned limit, not a guaranteed realized
            maximum.
          </p>
          <a className={link} href="#scanner-exit">
            Go to exit form
          </a>
        </Step>
        <Step
          number={10}
          time="After exit, or after 11:15 with no entry"
          title="Log the session and export separate backups"
        >
          <p>
            In Scanner observations and session notes, record passed/failed
            checks, skips and supervision problems. Save scanner session
            note. Keep losses, time exits and mistakes in the sample. No
            more entries in either journal after today’s 3R entry.
          </p>
          <p>
            Export scanner backup (JSON) and, with 3R v2 selected, Export
            scanner trades CSV. JSON preserves both scanner versions; CSV
            contains only the selected version. View old trades under “2R
            v1 — preserved history.” Export Practice separately; scanner
            trades never count toward the three-stock study.
          </p>
          <p>
            Review operations after five supervised sessions. Keep the
            strategy unchanged while collecting performance evidence. At
            one 3R entry per day, 100 trades require at least 100 entry
            sessions; this does not establish a 70% win probability.
          </p>
          <p>
            <a className={link} href="#scanner-notes">
              Session notes
            </a>
            {' · '}
            <a className={link} href="#scanner-backup">
              Scanner backups
            </a>
          </p>
        </Step>
      </ol>
      <p className="mt-4 text-xs leading-5 text-slate-400">
        Prepared for Monday 23 November 2026. Tuesday 24 November is a
        holiday in the{' '}
        <a
          className={link}
          href="https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf"
          target="_blank"
          rel="noreferrer"
        >
          NSE calendar
        </a>
        . For later sessions, check the applicable exchange notices first.
        The app’s regular-session calendar currently covers 2026.
      </p>
    </section>
  );
}
