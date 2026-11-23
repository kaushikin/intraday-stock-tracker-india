# Commodity feasibility review — 23 November 2026

**Result: reject standard CRUDEOIL, COPPER and GOLD futures under the current plan. No validated commodity entry/exit strategy is available.** This is a contract/risk feasibility review, not a backtest or evidence of profitability.

The user has ₹10,000 capital, no leverage, an existing ₹50 per-trade risk ceiling and a newly requested ₹250 total daily loss ceiling including costs. The daily ceiling is not ₹250 per trade or an additional commodity allowance. Stock journals, study selection and their existing stricter controls are unchanged. This release records the requested commodity planning constraint; it does not implement account-wide loss monitoring or broker enforcement.

## Contract arithmetic

| Standard future | Lot | Quoted unit | Tick | Rupees per tick per lot |
| --- | --- | --- | --- | --- |
| Crude oil | 100 barrels | 1 barrel | ₹1 | ₹100 |
| Copper | 2,500 kg | 1 kg | ₹0.05 | ₹125 |
| Gold | 1 kg | 10 grams | ₹1 | ₹100 |

One tick already exceeds ₹50, before any cost. For a separate feasibility stress check, allow a one-tick adverse move and one tick of slippage on **each** side, plus two ₹20 orders and 18% GST on brokerage. The resulting lower bounds are ₹347.20, ₹422.20 and ₹347.20 respectively. All exceed the entire ₹250 daily allowance before additional transaction costs. These are analytical assumptions, not observed fills, guaranteed maximum losses or recommendations to use a one-tick stop. A meaningful volatility-based stop can require more ticks; slippage can exceed the allowance.

Angel's published non-agricultural MCX futures tariff was checked on 23 November: ₹20 per order; exchange 0.00210% of turnover, CTT 0.01% on sells, SEBI ₹10/crore, stamp duty 0.002% on buys and 18% GST on the applicable taxable charges. The lower-bound calculation includes only brokerage and its GST, clearly labeled. The other charges must be added to any future sizing model. No promotional brokerage discounts, fractional lots or cash-equity fee formulas are used. The user's account-specific tariff has not been reconciled to a contract note.

For the no-leverage rule, full contract notional is quoted price multiplied by 100 (crude), 2,500 (copper) or 100 (gold). Broker margin must not be presented as full funding. This release does not invent a current quote, margin figure or financing approval.

## What is implemented

- A dated in-app feasibility review above the separate commodity price watch.
- Explicit blocked BUY readiness and unavailable EXIT monitoring, with source links and calculations.
- The ₹250 total daily planning ceiling, distinguished from per-trade risk and from an enforced daily-loss balance.
- A typed review model and regression tests for lot units, slippage, brokerage/GST and absence of journal storage access.

No trading strategy, actionable buy/exit alerts, commodity positions, background monitoring, broker orders or paper entries are enabled. The request to enable alerts was conditional on first validating a suitable strategy; that prerequisite failed. A recent quote cannot override the failed feasibility result.

## Requirements before a future alert release

1. Resolve funding/lot-size feasibility without silently loosening the user's limits. Any smaller contract is a distinct instrument requiring its own specification, liquidity and cost review.
2. Validate exact-contract prices, completed MCX candles, spread, session/holiday rules, tender periods and rollover behaviour. The NSE candle filter and 11:15 stock entry cutoff cannot be reused for MCX. Nearest expiry is not proof of liquidity or suitability.
3. Freeze an explicit candidate's entry, stop, target, time exit and event exclusions. Test on unseen data with realistic fills and all costs, then conduct separate forward paper research. No backtest or 70% win-rate claim was made here.
4. Build separate position tracking and a conservative total-daily-loss/open-risk calculation including all relevant activity, without treating unknown broker P/L as zero. Existing journals may supply read-only evidence but must not be mutated.
5. Implement alert deduplication, stale/error states, rollover identity checks, session boundaries and monitoring lifecycle. A manually refreshed screen cannot promise continuous alerts. Stops, alerts and a budget setting cannot guarantee the realised loss stays below ₹250.

## Primary sources

- [MCX crude, January 2026 contract specification](https://www.mcxindia.com/docs/default-source/products/contract-specification/crude-oil/crude-oil-january-2026-contract-onwards267be8c1-650a-4baa-aabd-ffcc9364c100.pdf)
- [MCX copper, May 2026 onwards](https://www.mcxindia.com/docs/default-source/products/contract-specification/copper/copper-may-2026-contracts-onwards.pdf)
- [MCX gold, August 2026 onwards](https://www.mcxindia.com/docs/default-source/products/contract-specification/gold/gold-august-2026-contract-onwardsd4df534857fb64e3bdfdff00007acb3574ea8ae7-7504-4567-a819-64dc0c700557.pdf)
- [Angel One tariff, commodity futures section](https://www.angelone.in/exchange-transaction-charges)

The specifications reviewed cover the displayed 2026 contracts. Recheck applicable circulars before using a later expiry; the UI is a dated review and never approves a new contract automatically.
