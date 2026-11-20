# Intraday Stock Tracker India

A private Next.js 14 application for Indian cash-equity research and journaling. Angel One supplies quotes and candles. The Practice page (`/signals`) now runs an explicit paper-trading workflow for a ₹10,000 study account. It does not submit orders or claim a profitable strategy or a 70% win probability.

Repository: https://github.com/kaushikin/intraday-stock-tracker-india

## Practice workflow

1. Keep three supported NSE cash shares at the front of the watchlist. Defaults are RELIANCE, TCS and HDFCBANK. The first three eligible entries form the study universe, which is fixed when the first research record is saved. Later watchlist edits do not change it.
2. Review company results and scheduled events before the 09:45–11:15 IST research window. Enter notes and verify the broker's round-trip cost estimate.
3. Open **Research readiness** and compare each study share with Angel One during market hours. Capture the app snapshot, independently enter the same completed stock/NIFTY candle start time and OHLC values, stock volume, LTP and exchange timestamp. A matching comparison is required each day before a paper entry for that share.
4. Wait for a completed five-minute trend-pullback setup with stock and NIFTY confirmation. Missing, stale, incomplete or misaligned data blocks qualification.
5. Record an entry explicitly at a fresh observed ask. Quantity must fit available cash, depth, spread and the remaining loss budget. This is a simulated entry, not proof of an exchange fill.
6. Supervise the position. Record the actual observed exit price, time, reason and total charges. Manual and time exits count. The app never turns a price touch into a historical trade or an automatic fill.
7. Export the journal regularly. Log the session after 11:45 IST, including feed failures, missed opportunities and rule adherence; review operations after five distinct sessions without changing strategy parameters. Review performance after at least 100 closed paper trades across 50 entry sessions, including costs, drawdown and net expectancy. These counts are a research checkpoint, not evidence by themselves that live trading is suitable.

The study uses `cash-pullback-v1`, documented in [docs/paper-research.md](docs/paper-research.md). Futures and CE/PE are excluded from this first phase.

## Risk and costs

- Initial practice equity: ₹10,000; keep 5% cash unallocated.
- Total planned risk per entry: the lesser of ₹50, 0.5% of current equity, and remaining loss-limit headroom. Costs and slippage are included.
- Loss limits: ₹100/day, ₹250/week, ₹500/month and ₹500 from the closed-equity high-water mark.
- One open position, maximum two entries per IST day, no fixed daily profit target.
- Target: 2× initial price risk. Minimum estimated net reward/risk: 1.2.

At ₹50 total risk, a 2R target can meet net R:R 1.2 only if total estimated charges and slippage are at most ₹13.33; whole-share rounding and available cash can make the limit stricter. The default ₹15 + ₹1 is an unverified placeholder and intentionally cannot qualify an entry. Enter real broker estimates; never lower costs or enlarge risk to force a trade. Actual gap losses can exceed planned risk.

## Readiness and charge checks

**Data status** distinguishes request failures, partial responses, exchange freshness, missing depth and historical closed-session snapshots. It shows exchange and receipt timestamps, last completed bars, request times and per-symbol failures. The fixed study symbols take priority in the 18-cash-share request budget, plus two index candle feeds. An OK request does not by itself mean the data is current.

**Broker charges** calculates the published standard Angel One NSE intraday tariff, reviewed 21 November 2026, for one buy order and one sell order. It itemizes brokerage, exchange/IPFT, SEBI, STT, stamp and GST and keeps a separate tax-rounding reserve. [Angel tariff](https://www.angelone.in/exchange-transaction-charges) and [NSE FA/73061](https://nsearchives.nseindia.com/content/circulars/FA73061.pdf) are linked in the panel. Account-specific offers/caps, additional orders, delivery and account fees need separate checking.

For the hypothetical entry ₹200 / stop ₹196 / target ₹208 with nine shares, published round-trip estimates are ₹12.43 at the stop and ₹12.46 at target. A ₹1 slippage allowance and ₹0.50 rounding reserve produce ₹49.96 planned risk but only 1.162 net R:R, so it fails. Lower-cost assumptions can fit mathematically, but no actual eligible market trade or account-specific fee schedule has been verified. Never alter assumed costs to force eligibility.

Use an existing contract note or the broker calculator to record a dated comparison, source label, broker total and discrepancy. No real order is required. Saved comparisons are self-reported and do not certify the account. The calculator does not automatically populate or reduce the entry cost field; use costs for the exact suggested quantity and exit scenario.

The supervised comparison accepts stock prices within one instrument tick, NIFTY OHLC within ₹0.01, exact stock volume and matching candle start times. Quote timestamps must be within 30 seconds and the captured snapshot saved within five minutes. A failed latest comparison revokes that share's pass; the pass resets next IST day. Fresh quote, candle and entry checks still run afterward. The form starts with blank broker values rather than copying the app's values.

The five-session review may include documented no-trade sessions. The performance checkpoint requires 100 closed trades and at least 50 entry sessions. Neither count is automatic evidence of a profitable strategy.

## Data sources

- **Angel One SmartAPI:** quotes, bid/ask, exchange timestamps and five-minute candles. Current NSE cash tokens and tick sizes come from the instrument master. Receipt timestamps do not prove exchange freshness.
- **News RSS:** dated, deduplicated headlines from the last 24 hours in the optional panel.
- **Hugging Face `ProsusAI/finbert`:** positive/negative/neutral financial-text classification. It sees headlines only. Its confidence is not a probability of a winning trade and never affects qualification. Provider errors are shown as unavailable. A 402 billing/credit failure is explicit and stops the remaining classification requests for that headline batch. The optional service is requested only on demand.
- **OpenAI:** the existing discipline coach, separate from paper entry qualification.

## Development

Use a Node.js version supported by the pinned Next.js dependency and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set private credentials in `.env.local` or the deployment environment. Never commit them. Authentication is required; an unconfigured auth token fails closed. Optional services can stay unset.

```sh
npm test
npm run typecheck
npm run build
```

Tests use Node's built-in runner and the installed TypeScript compiler. Browser checks should use fixtures and a separate local test auth token, never production credentials.

## Storage and compatibility

- Paper journal and optional versioned research evidence: `paper_trading_book_v1`, separate from older trades and `tracked_signals_v1` observations.
- Web Locks serialize journal writes; each write validates the latest stored state. Use a current browser in a secure context.
- Backup/restore supports the paper journal and older app backups. Restore asks before replacement. Invalid paper data is rejected and retained for recovery.
- The old dashboard, journal, analytics and scanner remain as legacy tools. Their results are not the new strategy's sample. Legacy settings do not alter Practice risk budgets.
- No server journal, order execution or reliable background monitoring. Suspended browsers can miss opportunities and exits. Exported records are self-recorded evidence, not audited broker statements.

## Calendar and validation limits

The calendar covers regular NSE sessions in **2026** using circulars CMTR/71775 and CMTR/72260. Special sessions are excluded. Entries fail closed in unverified years; verify and update before 2027. Corporate-action adjustments, actual broker latency, complete opportunity capture and transaction costs need validation against the broker terminal. See the research protocol for release checks.

No application can guarantee 70% winners. Evaluate net expectancy, loss size, costs and drawdown together; a high win rate can still lose money.
