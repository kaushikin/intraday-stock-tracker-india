# Cash research protocol, version 1

This is a testable hypothesis, not a validated trading edge. Preserve rules throughout a sample; if rules change, start a new strategy version and report it separately.

## Entry specification

- Study the first three supported NSE cash-equity watchlist symbols, long only. No leverage or derivative lots.
- Regular verified NSE sessions, entries from 09:45 inclusive to 11:15 exclusive, IST.
- Completed five-minute OHLCV bars only. Require at least 300 bars and 100 fully formed 15-minute bars for trend warm-up. Stock and NIFTY must have the same latest completed five-minute timestamp and current-session data.
- On both stock and NIFTY, the last completed 15-minute close must exceed EMA20, and EMA20 must exceed its value three bars earlier, as known at setup creation.
- The two five-minute candles before the setup must close above EMA20 and session VWAP. All three candles must be consecutive and from the current session.
- The bullish setup candle must touch or cross EMA20 and close above both EMA20 and session VWAP.
- Trigger: one current instrument tick above the setup high. Stop: one tick below its low. Target: trigger + twice the trigger-to-stop distance.
- Skip if a known prior-session or current-session high lies between trigger and target, or a subsequent completed candle has touched stop/target before entry.
- Setup expires two five-minute bars after its close. Explicit entry at a fresh ask at/above trigger and at most 10% of original stop distance beyond it. Missed intrabar touches cannot be reconstructed from polling.
- Reject missing exchange timestamps, quotes older than 30 seconds, missing/old candles, insufficient ask depth, spread plus per-share slippage over 10% of original stop distance, or net R:R below 1.2.

## Accounting and exits

All limits use the separate practice journal. ₹50 or 0.5% equity is a total planned loss cap including costs and slippage; remaining daily, weekly, monthly and drawdown headroom may reduce it. Quantity rounds down to whole shares and must fit 95% of equity in cash including costs. This does not model futures margin or option risk.

One open position and two entries/day are enforced. Entries retain an immutable setup snapshot and cannot be closed twice. Exit the whole position at an observed stop/target or after 30 minutes; record price, total round-trip charges and actual IST time. Time/manual exits stay in the denominator. Net P/L is `(exit − entry) × quantity − total charges`. Observed prices already reflect price slippage; the initial reserve is not deducted again at exit.

There is no automatic stop order or guaranteed loss cap. Gaps, spreads, fees, missed supervision and poor liquidity can cause losses beyond the plan. A closed tab cannot manage a trade.

## Review

Keep all entered trades, including mistakes and manual exits. Log skipped opportunities and reasons. Observations are recorded on demand; this version does not capture every market opportunity and is not an exhaustive backtest.

Review at least 100 closed entries across 50 sessions with entries. Record net win rate, net expectancy, profit factor, maximum closed-equity drawdown, adherence, missed opportunities, and estimated versus realized costs. The Wilson interval assumes comparable independent trades; clustering and changing conditions weaken those assumptions. There is no automatic pass at 70% or at the sample count. Inspect out-of-sample stability and execution feasibility before considering a small live pilot.

For this ₹10,000 study, derivatives remain an education/paper-research topic. A later phase must use contract-specific lot size, expiry, margin/premium, liquidity and costs. A cash signal alone is insufficient for CE/PE or futures.

## Release checks and limits

1. Run unit checks, TypeScript and a production build. Check mobile layout, authentication, explicit entry/exit, stale data, duplicate clicks, corrupt journal recovery and backup restore using fixtures.
2. During a regular session, compare stock/index token mapping, exchange timestamps, completed OHLCV and bid/ask against the broker terminal. Verify tick-size conversion and quantity-specific costs. No real orders are needed.
3. Validate provider failures and rate limits, including missing fields and partial candle errors. Stale fallback must never qualify a trade.
4. Verify the NSE calendar and special sessions. The present calendar covers regular 2026 sessions and blocks unverified years.
5. Keep legacy statistics separate. Main/production should change after branch review and operational checks.

This implementation has not established profitability, a 70% win rate, live fill quality, or availability of setups after costs. Corporate actions may distort unadjusted warm-up history; verify suspicious gaps against the broker terminal. Event checks remain manual because the app has no authoritative automated corporate-events calendar.

## Sources

- [FinBERT model card](https://huggingface.co/ProsusAI/finbert): financial-text sentiment.
- [Hugging Face text classification](https://huggingface.co/docs/inference-providers/tasks/text-classification): label/score output.
- [Angel One brokerage](https://www.angelone.in/support/charges-and-cashbacks/brokerage-charges): the entry check uses a partial brokerage/GST floor, not an all-in tax calculator. Verify your actual plan.
- [NSE 2026 holidays](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf) and [additional January closure](https://nsearchives.nseindia.com/content/circulars/CMTR72260.pdf).
