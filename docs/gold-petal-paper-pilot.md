# Gold Petal paper pilot v1 — 23 November 2026

## What has and has not been validated

The contract and funding arithmetic can fit a ₹30,000 fully funded paper account, ₹150 risk per trade and ₹250 total daily loss allowance. MCX Gold Petal is one gram per lot, quoted per gram, with a ₹1 tick. Angel's current master confirms `GOLDPETAL31DEC26FUT`, token `578631`, lot size 1 and a tick of 100 paise. Tokens are resolved from the current master, never hard-coded in the data path. November's expiry is intentionally skipped for new entries because it is within the pilot's ten-calendar-day exclusion.

This is **conditional budget feasibility**, not proof of profitability. No historical backtest, independent broker-screen comparison, forward-trading result or win-rate claim is fabricated. Every proposed entry must pass current data, strategy, verification, funding and risk checks. Synthetic tests verify the implementation, not trading performance.

For scale only, an observed public price near ₹12,700 per gram represents approximately ₹12,700 full exposure for one lot, not a margin deposit. A hypothetical ₹70 price stop plus normal round-trip fees around ₹49.4, ₹10 combined execution allowance and ₹2 rounding reserve is approximately ₹131.4. A chart-derived wider stop can fail ₹150 even when the notional fits ₹30,000. The app never tightens a stop or lowers costs to make a trade qualify.

## Frozen candidate and execution model

- Long only, one whole lot, one open paper position, at most one pilot entry per IST day. No leverage, averaging down, partial quantity or automatic order placement.
- Entry window 18:00–21:30 IST. The 2026 MCX evening calendar is separate from NSE. Full evening holidays/weekends are blocked; half-day morning closures are respected when parsing candles. Calendar or specification review is required before unsupported years/expiries.
- Use 50 contiguous completed five-minute bars from the current MCX session. The forming bar is excluded. On a half-day session, sufficient bars may arrive late or not within the entry window.
- Completed close exceeds the previous 20-bar high; EMA20 > EMA50; close > EMA20; volume at least 1.2 times the previous 20-bar mean.
- Stop is the lower of the last three lows minus ₹1 and breakout close minus the mean of the last 14 true ranges, rounded down to the tick. This is a simple mean true range, not Wilder-smoothed ATR.
- Bid/ask spread at most ₹3. Ask must remain above the breakout and no more than max(₹1, 0.25 ATR) above the breakout close. Model entry at ask + ₹5. It is a paper fill, not a market execution claim.
- Model stop/target exits with ₹5 adverse execution allowance. Add normal commodity fees and a ₹2 rounding reserve. Reserve the greater modeled/verified fee for either exit at admission and closing.
- Compute a target providing at least 2R net of modeled charges and execution reserves. This is a research hypothesis, not a forecast that the target is reachable.
- Full notional plus cost reserves must fit both ₹30,000 and current pilot equity. Maximum planned trade risk is ₹150. Gaps/slippage can exceed it.

## Fees and independent verification

The versioned Angel MCX non-agricultural futures estimate uses two normal ₹20 executed orders, exchange fees of 0.00210% on turnover, SEBI fees of ₹10/crore, CTT of 0.01% on the sell value, stamp duty of 0.002% on the buy value and 18% GST on brokerage/exchange/SEBI fees. No introductory discount or NSE equity tariff is substituted. Totals round upward to a paisa; the additional ₹2 reserve acknowledges contract-note rounding differences.

Before entry the user enters the exact Angel contract, completed-bar start and close, a recent quote and its observation time, and full account-tariff/calculator fees at both stop and target. The app numerically checks contract/time/close/quote and requires an explicit confirmation of all OHLC/volume, session/tender dates and the event calendar. A quote must be within ₹1 and observed within 30 seconds; stored app exchange, trade and receipt timestamps must also be fresh. Account fees below the published estimate are rejected. Higher fees re-evaluate risk and target; the user must recheck the changed target.

## Daily ceiling and isolation

Only `gold_petal_paper_pilot_v1` is written. Practice (`paper_trading_book_v1`) and scanner (`scanner_paper_journal_v1`) are parsed **read-only** for current-day losing trades and reserved open risk. Watchlist, study symbols, existing trades and stock strategy limits are not changed. Savings, deposits and real broker funds are not touched.

The user must declare other trading losses/open risk, including zero, each IST day. The declaration cannot be reduced during that day. Positive results do not replenish the daily loss allowance. Pilot admission checks known losses + open risk + declared outside risk + proposed risk ≤ ₹250 and refuses entry while a stock paper position is open. All writers acquire the existing stock-book locks before the new pilot lock, preventing simultaneous pilot admissions from racing stock reads.

This gate controls **pilot admissions only**. Existing stock pages, other browsers/devices and the broker do not share a new global lock or broker-wide position feed. The UI explicitly asks the user to avoid other trading while the pilot is open and states the limits of the check. It does not claim that ₹250 is a broker-enforced or guaranteed realised-loss cap. Unreadable stock books block new entries; they do not prevent recording a pilot exit. Corrupt pilot data is never silently reset.

## Exit alerts and records

Visible, opt-in checks run about every 30 seconds through the existing shared Angel limiter. The app requests only MCX candles and FULL quotes for a server-resolved Gold Petal contract. It pauses checks in hidden tabs and when closed. Provider errors clear prior quotes. Failures and stale data block entries; partial quote success can still support exit review after candle failure.

Alerts cover stop/target touches in observed quotes or post-entry completed bars, ₹150 trade risk, ₹250 combined daily risk, 30 minutes, 22:00 IST and session rollover. The first observed trigger is retained in the separate pilot record. If both levels appear in available bars, stop gets priority. No unseen tick, historical fill or automatic execution is invented. Snapshots can miss touches, especially in the entry bar or while the screen is closed.

The user explicitly records each exit. App-priced exits require a fresh matching saved contract and current bid; changed/stale quotes require rechecking. Manual exits are available during feed failure with price, full charges, reason and a verification reference. Losses are never clamped at the stop, ₹150 or ₹250. The resulting net P/L is preserved with the original plan and evidence. Backup export contains only the new pilot records; it does not mix them into either stock journal.

## Evidence plan

Review operational problems after five sessions, keeping strategy thresholds fixed. Gather at least 50 sessions and 100 closed paper trades before evaluating performance; at one trade per day this necessarily takes at least 100 trading days. Calendar/specification reviews are required across year boundaries. Evaluate net expectancy, loss distribution, slippage, missed opportunities and manual/late exits as well as win rate. Do not infer a 70% win probability from software tests or the separate stock study.

## Primary references

- [MCX Gold Petal specification, July 2026 onwards](https://www.mcxindia.com/docs/default-source/about-us/gold-petal-july-2026-contract-onwards.pdf)
- [MCX 2026 session/holiday calendar](https://www.mcxindia.com/market-operations/trading-surveillance/trading-holidays)
- [Angel published charges, commodity futures section](https://www.angelone.in/exchange-transaction-charges)
- [Angel current instrument master](https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json)
