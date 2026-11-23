# Intraday Stock Tracker India

A private Next.js 14 application for Indian cash-equity research and journaling. Angel One supplies quotes and candles. The Practice page (`/signals`) now runs an explicit paper-trading workflow for a ₹10,000 study account. It does not submit orders or claim a profitable strategy or a 70% win probability.

Repository: https://github.com/kaushikin/intraday-stock-tracker-india

The [active scanner 3R protocol](docs/scanner-3r.md), also explained at `/cash-plan`, uses a separate `scanner-cash-3r-v2` strategy with larger cost reserves and the same ₹50 planned-risk cap. Practice remains 2R. Old scanner trades remain in the 2R history selector with separate statistics and CSVs; combined JSON backups preserve both versions. Refresh all app tabs before using this release.

**Scan → Monday checklist · 3R scanner** contains the ten-step supervised workflow: backups, account fees, budget, scan, independent OHLCV comparison, exact stop/target charges, entry, supervision, exit and session review. Expand a step and follow its links to the existing forms. This guide does not save trades or change strategy rules, journal records or the three-stock study.

**Scan → Open ONGC practice demo** (`/market/demo`) rehearses data verification, costs and entry with fictional readings and a simulated Monday clock. Choose **Stop-loss exit**, **Target-hit exit** or **30-minute time exit**. Each choice has its own observed bid, timestamp, reason and round-trip costs. Changing scenario restarts all exercise checks; Reset demo repeats the selected scenario. It uses the current 3R and charge calculations, holds progress only in React memory and resets on refresh or Reset demo. The demo route excludes the normal app providers, live polling and journal hooks; it has no storage writes, export/import or order actions. Demo results do not count toward either study or use the shared entry allowance. Practise mismatched volume and higher fees before completing the example. Use demo mode only when no open paper position needs supervision.

## Practice workflow

Start with the [Monday verification checklist](docs/monday-checklist.md), also linked from Practice. It covers share selection, Angel One data comparison, broker charges and the entry checklist.

1. Keep three supported NSE cash shares at the front of the watchlist. Defaults are RELIANCE, TCS and HDFCBANK. The first three eligible entries form the study universe, which is fixed when the first research record is saved. Later watchlist edits do not change it.
2. Review company results and scheduled events before the 09:45–11:15 IST research window. Enter notes and verify the broker's round-trip cost estimate.
3. Open **Research readiness** and compare each study share with Angel One during market hours. Capture the app snapshot, independently enter the same completed stock/NIFTY candle start time and OHLC values, stock volume, LTP and exchange timestamp. A matching comparison is required each day before a paper entry for that share.
4. Wait for a completed five-minute trend-pullback setup with stock and NIFTY confirmation. Missing, stale, incomplete or misaligned data blocks qualification.
5. Record an entry explicitly at a fresh observed ask. Quantity must fit available cash, depth, spread and the remaining loss budget. This is a simulated entry, not proof of an exchange fill.
6. Supervise the position. Record the actual observed exit price, time, reason and total charges. Manual and time exits count. The app never turns a price touch into a historical trade or an automatic fill.
7. Export the journal regularly. Log the session after 11:45 IST, including feed failures, missed opportunities and rule adherence; review operations after five distinct sessions without changing strategy parameters. Review performance after at least 100 closed paper trades across 50 entry sessions, including costs, drawdown and net expectancy. These counts are a research checkpoint, not evidence by themselves that live trading is suitable.

The study uses `cash-pullback-v1`, documented in [docs/paper-research.md](docs/paper-research.md). Futures and CE/PE are excluded from this first phase.

Practice automatically checks the fixed study shares while the tab is visible during regular market hours (quote requests about every 10 seconds, candle requests about every 30 seconds, subject to provider delays). It does not select a different universe each day, record fills automatically or monitor a closed app. NIFTY is confirmation, not a cash share to enter. A saved study universe takes precedence over subsequent Watchlist edits.

The **Scan** tab (`/market`) is a separate Nifty 50 exploratory screen. It reads the official current constituents, fetches candle history in small sequential batches, then refreshes quotes and sizes candidates with quantity-specific charges. It shares the closed-candle pullback conditions with Practice but locks a separate 3R target and enforces its own cost rules. Its paper journal never writes to the three-share study or Watchlist. Both entry paths enforce combined cash/loss limits while keeping performance samples separate. See [scanner operation and limits](docs/nifty50-scanner.md).

See the [scanner paper journal and Monday readiness review](docs/scanner-paper-journal.md) for entry/exit, independent OHLCV comparisons, fee checks, session notes and separate backup/restore. Journal records remain on the current browser/device; deployments do not synchronize them.

## Risk and costs

- Initial practice equity: ₹10,000; keep 5% cash unallocated.
- Total planned risk per entry: the lesser of ₹50, 0.5% of current equity, and remaining loss-limit headroom. Costs and slippage are included.
- Loss limits: ₹100/day, ₹250/week, ₹500/month and ₹500 from the closed-equity high-water mark.
- One open position across both journals. Scanner 3R requires no prior entry in either journal that day and consumes the day’s entry allowance. Practice keeps its two-entry maximum on days without 3R. Shared guards use all versions’ closed P/L for loss headroom; performance samples stay separate.
- Practice target: 2× original price risk. Active scanner target: 3× original price risk, with ₹5,000 purchase-value cap, at least ₹5 execution reserve and ₹1 rounding reserve. Minimum net reward/risk stays 1.2 in both.

For the unchanged Practice study, at ₹50 total risk, a 2R target can meet net R:R 1.2 only if total estimated charges and slippage are at most ₹13.33; whole-share rounding and available cash can make the limit stricter. The default ₹15 + ₹1 is an unverified placeholder and intentionally cannot qualify an entry. Enter real broker estimates; never lower costs or enlarge risk to force a trade. Actual gap losses can exceed planned risk.

## Readiness and charge checks

**Data status** distinguishes request failures, partial responses, exchange freshness, missing depth and historical closed-session snapshots. It shows exchange and receipt timestamps, last completed bars, request times and per-symbol failures. The fixed study symbols take priority in the 18-cash-share request budget, plus two index candle feeds. An OK request does not by itself mean the data is current.

**Broker charges** calculates the published standard Angel One NSE intraday tariff, reviewed 22 November 2026, for one buy order and one sell order. It itemizes brokerage, exchange/IPFT, SEBI, STT, stamp and GST and keeps a separate tax-rounding reserve. The normal brokerage is capped separately per leg at 2.5% of value, or ₹0.25 per share for prices at/below ₹10, before GST. [Angel tariff](https://www.angelone.in/exchange-transaction-charges), [SEBI question 19](https://www.sebi.gov.in/sebi_data/faqfiles/sep-2024/1727418208774.pdf) and [NSE FA/73061](https://nsearchives.nseindia.com/content/circulars/FA73061.pdf) are linked in the panel. Account-specific offers, additional orders, delivery and account fees need separate checking. Old charge comparisons and scanner proofs replay their saved estimator without rewriting history. New Practice entries require the full estimated stop/target charges, not a partial brokerage/GST floor.

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
- The old dashboard, journal and analytics remain as legacy tools. The Scan tab is a separate exploratory tool. Their results are not the new strategy's sample. Legacy settings do not alter Practice risk budgets.
- No server journal, order execution or reliable background monitoring. Suspended browsers can miss opportunities and exits. Exported records are self-recorded evidence, not audited broker statements.

## Calendar and validation limits

The calendar covers regular NSE sessions in **2026** using circulars CMTR/71775 and CMTR/72260. Special sessions are excluded. Entries fail closed in unverified years; verify and update before 2027. Corporate-action adjustments, actual broker latency, complete opportunity capture and transaction costs need validation against the broker terminal. See the research protocol for release checks.

No application can guarantee 70% winners. Evaluate net expectancy, loss size, costs and drawdown together; a high win rate can still lose money.

### Shared Angel request limits

Angel login, quotes and candles now share rolling limits of **2/second, 40/minute and 2,000/hour**, with at least two seconds between requests. A connected Upstash Redis database is required; tracking failures stop requests safely. The scanner shows shared counters and retry timing. A first connection or lost ledger has a one-time 61-minute safety wait; normal restarts retain the ledger. See [setup, retries and verification](docs/angel-shared-limits.md). This does not change either journal, the three-stock study or the 3R strategy.

### Commodity watch (data only)

**Commodities** under Tools (or More on mobile) opens a separate manual price panel for standard MCX crude oil, copper and gold futures. It resolves the nearest listed expiry strictly after today from Angel's current instrument master; expired tokens, options and mini variants are excluded. Each refresh requests all three contracts in one quote batch through the same shared Angel limiter. Exchange feed, last-trade and receipt timestamps are shown, and snapshots become stale after 30 seconds. Match the exact contract and expiry in Angel One before trusting a price. MCX trading hours differ from NSE; this panel does not infer an open session from the stock market clock.

The [23 November commodity feasibility review](docs/commodity-validation.md) is displayed above the quotes. Standard lots fail the current risk plan: even a one-tick stop with one tick of slippage on each leg and normal brokerage/GST exceeds the requested ₹250 total daily ceiling, before other charges. BUY alerts stay blocked; EXIT monitoring is not active. The ₹250 figure is a planning ceiling, not an enforced balance or a per-trade allowance. This release does not add positions, orders, background monitoring or journal writes, and does not change cash-stock rules or the three-stock study. Profitability has not been validated.

### Gold Petal paper pilot

The separate [Gold Petal pilot](docs/gold-petal-paper-pilot.md) at `/commodities/gold-petal` uses ₹30,000 paper capital, one gram per lot, full-notional funding, ₹150 total trade risk and a ₹250 daily pilot-admission gate. It has its own record key and export. Both stock journals and the three-stock study stay unchanged; stock losses/open risk are read only. A daily declaration covers other activity. The gate cannot restrict other pages, devices or broker orders.

The frozen long-only breakout candidate uses completed MCX candles, structural/ATR stops, normal commodity fees, adverse execution reserves and at least 2R after costs. One entry per IST day, independent Angel verification and fresh bid/ask data are required. Optional on-screen checks show exit alerts; the user records paper exits explicitly. Hidden/closed tabs do not provide continuous monitoring. Budget feasibility is conditional; strategy profitability is unproven. No broker orders are supported.

Provider references: [Angel SmartAPI](https://smartapi.angelone.in/docs/ResponseStructure) and [current instrument master](https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json). Product references are linked on each card. Quotes are exchange-quoted unit prices, not one-lot cost or margin.
