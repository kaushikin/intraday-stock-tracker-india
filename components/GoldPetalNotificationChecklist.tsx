import type { ReactNode } from 'react';
import { ClipboardCheck } from 'lucide-react';

const link =
  'text-teal-200 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300';

function Step({
  number,
  title,
  when,
  children,
}: {
  number: number;
  title: string;
  when: string;
  children: ReactNode;
}) {
  return (
    <li>
      <details
        open={number === 1}
        className="rounded-xl border border-slate-700/80 bg-slate-950/40 p-3 sm:p-4"
      >
        <summary className="cursor-pointer rounded font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300">
          {number}. {title}
          <span className="mt-1 block pl-5 text-xs font-normal text-slate-400">
            {when}
          </span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
          {children}
        </div>
      </details>
    </li>
  );
}

export default function GoldPetalNotificationChecklist() {
  return (
    <details
      id="gold-petal-notification-checklist"
      open
      className="scroll-mt-6 rounded-2xl border border-teal-800 bg-teal-950/20 p-4 sm:p-5"
    >
      <summary className="cursor-pointer rounded font-semibold text-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300">
        <ClipboardCheck className="mr-2 inline h-5 w-5" aria-hidden="true" />
        Notification checklist · next session
      </summary>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Expand each step and use the links to reach the existing controls.
        Reading this guide does not enable alerts or confirm delivery. No test
        trades are needed in either stock journal or the Gold Petal pilot.
      </p>
      <div className="mt-3 rounded-xl bg-slate-950/50 p-3 text-sm">
        <p className="font-medium text-teal-200">Test window · IST</p>
        <p className="mt-1 text-slate-300">
          On an eligible trading day, start after 6:00 PM and queue the
          closed-page test before 9:27 PM. Today’s watch ends at 9:30 PM.
        </p>
      </div>
      <ol
        className="mt-4 space-y-3"
        aria-label="Gold Petal notification checklist steps"
      >
        <Step
          number={1}
          title="Allow Chrome notifications on your Mac"
          when="Before the session"
        >
          <p>
            Open Apple menu → System Settings → Notifications → Google Chrome.
            Turn Allow notifications on and choose a visible notification style,
            rather than None. If Chrome is not listed, note that before testing;
            do not reset the browser.
          </p>
          <a
            className={link}
            href="https://support.apple.com/en-in/guide/mac-help/mh40583/mac"
            target="_blank"
            rel="noreferrer"
          >
            Apple notification settings
          </a>
        </Step>
        <Step
          number={2}
          title="Turn off Focus and keep the Mac awake"
          when="Before the session"
        >
          <p>
            Open Control Centre → Focus and turn off Do Not Disturb or any
            active Focus for the test. Keep the Mac awake, its lid open and the
            internet connected. Leave Chrome running for this first closed-page
            test.
          </p>
          <a
            className={link}
            href="https://support.apple.com/guide/mac-help/mchl999b7c1a/mac"
            target="_blank"
            rel="noreferrer"
          >
            Apple Focus settings
          </a>
        </Step>
        <Step
          number={3}
          title="Use the Chrome profile that holds your journals"
          when="Before the session"
        >
          <p>
            Use the same Chrome profile and app address as your existing
            journals, in a normal window rather than Incognito. In this site’s
            settings, confirm Notifications is set to Allow. Do not clear site
            data or browser storage: your journal records are stored in this
            browser.
          </p>
          <a
            className={link}
            href="https://support.google.com/chrome/answer/3220216?hl=en&co=GENIE.Platform%3DDesktop"
            target="_blank"
            rel="noreferrer"
          >
            Chrome notification settings
          </a>
        </Step>
        <Step
          number={4}
          title="Check the scheduler at the start of the session"
          when="6:00 PM–before 9:27 PM IST · eligible trading days"
        >
          <p>
            Refresh this page and press Check alert status. Look for Scheduler
            connected and a Last server contact within the previous couple of
            minutes. A connected scheduler can still have today’s watch off.
          </p>
          <p>
            If setup is still needed, use Connect the free background checker
            below. Once connected, there is no need to paste the token again. If
            the server contact is missing or old during this window, keep the
            page open and resolve that before relying on alerts.
          </p>
          <a className={link} href="#gold-petal-alert-status">
            Go to alert status
          </a>
        </Step>
        <Step
          number={5}
          title="Confirm today’s risk and send the first test"
          when="Page open"
        >
          <p>
            In Confirm today’s total risk above, enter the day’s actual outside
            risk and press Confirm today’s outside risk. Use ₹0 only if it is
            accurate. Review the existing ₹150 per-trade limit including charges
            and ₹250 total daily loss allowance.
          </p>
          <p>
            Return here, tick the risk acknowledgement and press Enable today’s
            alerts + send test. Allow the browser’s notification request if one
            appears. Do not record a paper entry or exit for this test.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-2">
            <a className={link} href="#gold-petal-daily-risk">
              Go to today’s risk
            </a>
            <a className={link} href="#gold-petal-alert-controls">
              Go to alert controls
            </a>
          </p>
        </Step>
        <Step
          number={6}
          title="Confirm only a notification you actually received"
          when="Page open"
        >
          <p>
            Look for Gold Petal alert test on your Mac. You can also check
            Notification Centre by clicking the date and time in the menu bar.
            Only after you see the notification, press I received the test
            notification below.
          </p>
          <p>
            A sent message in the app is not proof of receipt. If no
            notification appears, do not confirm it or continue to the
            closed-page test. Keep the page open and copy the exact error shown
            beside the controls.
          </p>
          <a className={link} href="#gold-petal-alert-controls">
            Go to notification confirmation
          </a>
        </Step>
        <Step
          number={7}
          title="Test with all trading-app tabs closed"
          when="Queue before 9:27 PM IST"
        >
          <p>
            After confirming the first notification, press Send closed-page test
            in 1–2 minutes. Wait for Test queued, then close all tabs for this
            trading app. Leave Chrome itself running and the Mac awake.
          </p>
          <p>
            Look for Gold Petal · closed-page TEST. This checks notification
            delivery without creating a trade. Candidate checks pause briefly
            during the test and resume afterward.
          </p>
          <a className={link} href="#gold-petal-alert-controls">
            Go to closed-page test
          </a>
        </Step>
        <Step
          number={8}
          title="Review the result and finish safely"
          when="Within three minutes, then after the test"
        >
          <p>
            If no closed-page notification arrives within three minutes, reopen
            this page and press Check alert status. Note the exact error or test
            status and Last server contact time. Do not assume delivery worked
            just because the app says sent.
          </p>
          <p>
            If you are only practising, press Stop background alerts afterward.
            Otherwise, stop or update the watch before trading elsewhere or
            changing your risk. Enable afresh each session; the watch expires at
            9:30 PM IST.
          </p>
          <p>
            Seeing both test notifications confirms this delivery test. It does
            not verify Angel One prices or qualify a paper trade. Both stock
            journals and the three-stock study stay separate and unchanged.
          </p>
          <a className={link} href="#gold-petal-alert-controls">
            Go to status and stop controls
          </a>
        </Step>
      </ol>
    </details>
  );
}
