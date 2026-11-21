# Scanner 3R v2 — active supervised paper version

New Scan entries use `scanner-cash-3r-v2`. The fixed three-stock Practice study remains `cash-pullback-v1` with its original 2R target. Old scanner 2R trades, notes and fee evidence remain available under **Scanner results version → 2R v1 — preserved history**. No broker orders are submitted.

## Frozen entry and cost rules

- Official current Nifty 50 NSE cash constituents only, long only, whole shares, no leverage or derivatives. The fixed study's shares cannot be entered in the scanner journal.
- Keep the completed five-minute EMA20/VWAP pullback, stock and NIFTY 15-minute confirmation, warm-up history, two-bar expiry and 09:45–11:15 IST entry window. Missing, stale or misaligned data blocks entry.
- Trigger one current tick above the setup high; stop one tick below its low. Target is the trigger plus **three times the original trigger-to-stop distance**. Known current/prior-session highs between trigger and the 3R target block the setup. Other resistance and scheduled events still require manual review.
- Enter at a fresh observed ask at/above trigger, at most 10% of the original stop distance above it. A later ask never moves the stop or target. Displayed ask depth must cover the whole quantity.
- Observed bid/ask spread must not exceed 10% of original stop distance. Quantity × spread plus execution reserve must not exceed 25% of original gross stop risk.
- For every whole-share quantity, reserve the largest of **₹5**, the entered adverse-execution allowance, **two spreads × quantity**, and **two ticks × quantity**. These are minimum planning assumptions, not certified fill costs. Increase the entered allowance when evidence requires it; never lower it to force qualification.
- Recompute corrected Angel One round-trip charges at both stop and target for the exact quantity; use the larger amount. Add at least **₹1 tax rounding** and any additional verified account charges. Inputs below the execution/rounding floors are rejected.
- Total planned loss, including all charges and execution reserve, must be no more than the smaller of **₹50**, **0.5% of combined equity**, and remaining shared loss headroom. Net target reward/risk must be at least **1.2**, using unrounded values.
- Purchase value is capped at **₹5,000**. Purchase plus all cost reserves must fit at most **₹9,500**, reduced if the shared account has less available cash. Fees are never paid with assumed leverage. The sizer tries whole-share quantities and rejects the setup if none fits all gates.
- One 3R entry per IST day: neither journal may already contain an entry that day. A recorded 3R entry also blocks further Practice entries that day. Practice retains its existing two-entry maximum on days without a 3R entry. One open position is permitted across all versions and both journals.
- Shared loss limits remain ₹100/day, ₹250/week, ₹500/month and ₹500 drawdown. Old closed P/L remains in combined equity and headroom; a new version does not reset the account.

## Supervision and exits

Record the whole-position exit at an independently observed stop/target or after 30 minutes. Time/manual exits and mistakes remain in the sample. Never extend the time limit to wait for a 3R winner or invent a missed historical fill.

3R paper exit charges must cover the published fee estimate plus the entry's saved rounding and extra-charge reserves. The UI fills these estimates from a current bid if available. The original execution reserve is not subtracted again from an observed entry/exit price; it was a planning allowance, not a second brokerage fee. Observed quotes still do not certify real fills. Higher actual fees or adverse execution can exceed the original risk plan.

Old open 2R scanner positions remain manageable under their original stop, target and planning fields. Closing them does not convert them to 3R or change their previous entry costs.

## Version separation and backups

- The existing scanner storage key is retained. Reading a legacy JSON backup does not rewrite it or reset records. The next explicit scanner save uses backup format 2, retaining all historical records and their original strategy/charge calculation versions.
- The results selector filters statistics, history and notes by strategy. CSV export contains only the selected version and includes a `strategy_version` column. Default results and new notes are 3R v2. Versions are never pooled into a win rate or the Practice study.
- Scanner JSON backups include both versions and their evidence. Restore accepts old format-1 scanner backups and current format 2, merges compatible history and rejects conflicts, overlapping positions, or violations of a 3R single-entry day. Practice backups remain separate and cannot import scanner records.
- New format-2 saves make old app tabs reject the scanner journal instead of silently overwriting 3R records. Refresh **all open app tabs** before use. Keep one browser/device and export both journals; GitHub/Vercel do not synchronize browser journals.
- Unreadable storage blocks new entries. Existing scanner exits remain available if only Practice storage is unreadable. Existing Web Locks coordinate writers and guards across tabs; failed storage writes preserve the previous saved value.

## Using the release

For a rehearsal, open **Scan → Open ONGC practice demo** (`/market/demo`). All prices, candles, depth and times are fictional. The isolated route does not mount the normal application providers or journal hooks. Data/fee checks and the simulated entry/exit are temporary memory only; reset/refresh clears them without touching old trades, either journal, the watchlist, research counters or account risk limits. No demo export, import, live market request or broker order exists. A mismatch or changed readings invalidates readiness; the fixed exercise accepts a matched price/candle comparison and fees covering the current tariff. It then rehearses a 15-share ₹200 entry, ₹198 stop, ₹206 target and ₹197.90 stop exit with ₹13.86 total estimated charges, producing −₹45.36. Demo success is not actual broker verification. Leave any ongoing paper-position supervision complete before practising.

The full ten-step Monday checklist is built into **Scan**, above the budget controls, at `/market#scanner-monday-checklist`. It includes expandable instructions and links to the data comparison, exact fee check, entry, open-position exit, notes and backup forms. Before selecting a candidate, data/fee/entry links lead to the candidate review instructions. The guide itself does not record verification evidence or write either journal; the existing saved checks still govern entry eligibility.

1. Refresh the app and other open tabs. Export the scanner and Practice backups. Confirm the three fixed study shares.
2. Open **Scan**. Confirm **Nifty 50 scanner · 3R**, the ₹50 risk cap, available cash, at least ₹5 execution reserve and ₹1 rounding reserve, plus higher account costs if applicable.
3. During 09:45–11:15 IST, scan the official list, then recheck a candidate. Zero qualifying results is valid.
4. Independently compare exchange timestamps, completed stock/NIFTY candles, OHLCV, bid/ask and depth with Angel One. Save the matching comparison. Verify both stop and target fee totals for the exact journal quantity; higher fees require increasing extra charges and recalculating.
5. Complete event/supervision notes and the checklist. Only then explicitly record the 3R paper entry. Keep the tab visible and supervise the position; the app has no automatic orders or guaranteed stops.
6. Record the observed exit and full costs. Review **3R v2 — active paper sample**; select **2R v1 — preserved history** only to inspect/export older results. Export the combined scanner JSON and separate Practice backup.

Review operations after five supervised sessions. Freeze the strategy during performance collection; assess at least 100 closed entries. With one entry per day this requires at least 100 entry sessions, longer with no-trade days. Include time/manual exits, all costs, net expectancy, profit factor, drawdown and adherence. No sample count establishes a 70% win probability.

₹50 is a planned loss limit, not a guaranteed maximum realized loss. Account-specific charges, fills, setup frequency and profitability remain unverified. Regular-session calendar support remains limited to 2026; unknown years fail closed.
