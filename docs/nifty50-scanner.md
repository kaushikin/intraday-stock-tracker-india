# Nifty 50 scanner — separate exploratory screen

Open **Scan** (`/market`). This replaces the legacy market overview and its broken >20-symbol request. The three-share Practice strategy, stored universe, journal and 100-trade/50-session sample remain separate. Entry safety now checks both paper journals together; their statistics are never pooled. See the [scanner paper journal and readiness guide](scanner-paper-journal.md).

## Run a scan

1. Confirm the standalone risk and cash scenario: up to ₹50 total planned risk and ₹9,500 unleveraged cash from the ₹10,000 baseline. Lower these if less is actually available. The shortlist is a standalone scenario. Its separate paper journal rechecks remaining combined cash/loss limits before an entry.
2. Keep realistic slippage, tax-rounding and any extra round-trip charges. Defaults remain ₹1 / ₹0.50 / ₹0. Published Angel charges are estimates, not verified account costs. With normal minimum brokerage these defaults cannot qualify under the current 2R / 1.2-net-RR rules. Small-order legal brokerage caps are now included. See the separate [cash-plan proposal](cash-plan-v2-proposal.md); it does not activate new scanner rules.
3. Click **Scan Nifty 50** in the 09:45–11:15 IST entry window. Outside it, **Check Nifty 50 feeds** performs a connection check only; there is no live shortlist. Keep the tab visible. A full run can take a few minutes.
4. Optional repeat scans run five minutes after the previous run finishes, while visible and in the entry window. No overlapping scan starts. Hiding the tab or leaving the page cancels the current run. Reopen and run again; there is no background or closed-app monitoring.
5. Review up to five current shortlist results, ordered by estimated net reward/risk, then spread and symbol. This ordering is not a calibrated probability of winning. Expand **All 50 results** for exclusions and provider failures.
6. Use **Recheck SYMBOL** to fetch that stock's candles, NIFTY candles and a fresh quote. Quotes expire after 30 seconds; shortlist eligibility is recomputed every five seconds and can disappear. A full scan refreshes the entire universe. A one-share recheck retains other observations but does not make their quotes fresh.
7. Independently verify the broker's stock/index bars, timestamps, exact account charges and scheduled events before interpreting a candidate. Export the scan snapshot if useful. Scan snapshot exports contain observations and settings; they do not create trades. Use **Review paper entry** to complete comparisons and fees, then explicitly save in the separate scanner journal. Study shares must be entered in Practice.

## Membership and data

The server retrieves the [NSE Indices constituent CSV](https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv), with the [official NSE archive](https://archives.nseindia.com/content/indices/ind_nifty50list.csv) as an alternate source. It validates exactly 50 unique EQ members, names and ISINs, caches only within the same IST date, and reports when the file was checked. There is no old hardcoded-list fallback. An unexpected count or source failure stops the scan.

The provider's current NSE cash instrument master resolves each symbol and tick size, including constituents absent from the legacy supported-share list. This expands feed coverage only; it does not expand the fixed study's allowed universe or journal-entry validation. Missing instruments remain visible failures and are not silently skipped.

The client fetches four shares plus NIFTY per candle request, sequentially, with spacing between requests. The existing server also spaces individual candle calls. Quotes are requested afterward in batches of at most 15, so history loading does not age the initial quotes. The API's 20-symbol limit stays intact. Failures clear the affected data; there is no stale fallback. The latest stock and NIFTY completed bars must align and remain current. A scan crossing a five-minute boundary can therefore exclude early observations until they are rechecked.

## Setup and cost filters

The scanner directly reuses `findPaperSetup` from `cash-pullback-v1`: long cash shares, completed five-minute EMA20/VWAP pullback, stock and NIFTY 15-minute trend confirmation, warm-up history, unobstructed target and two-bar setup expiry. It does not use the old buy/sell score or Hugging Face sentiment.

Fresh quote checks, actual ask at/above trigger, no chasing beyond 10% of the original stop distance, valid bid/ask and sufficient displayed depth are required. Spread plus per-share slippage must remain within 10% of the original stop distance.

For each whole-share quantity, the scanner recomputes published round-trip fees for both stop and target exits. It reserves the larger total, plus rounding and extra charges. Slippage is included separately in both loss and reward estimates and in cash required. A result passes only if unrounded risk and cash fit and net reward/risk is at least 1.2. It chooses the largest quantity satisfying all these conditions. A pathological quantity above 100,000 is rejected instead of performing unbounded computation.

At ₹50 risk and a 2R price target, total costs must be at most ₹13.33 before whole-share and entry-price effects. The standard ₹11.80 two-order brokerage/GST floor plus default ₹1 slippage and ₹0.50 rounding already consume ₹13.30 before other levies. A zero-candidate result can therefore be correct; no fees, risk caps or strategy thresholds are automatically relaxed.

## Separation and limits

- Scanner actions write only the scanner journal key. No Watchlist or study writes, automatic entries/exits, or broker orders. Practice and scanner entry paths use the same lock and combined risk check.
- Raw scan snapshots are kept in component memory and optional exported JSON; reloading clears them. Explicit paper trades, comparisons, fee checks and notes persist separately in browser storage. Back up both journals; the samples are not pooled.
- Displayed shortlist fit refers to the entered standalone scenario. The journal recomputes sizing using remaining shared cash/risk, enforces one open position and two entries/day across both journals, and requires saved broker comparisons and exact-plan fee evidence.
- The existing calendar covers regular 2026 NSE sessions and fails closed in unverified years.
- Published fees include the per-order exchange brokerage ceiling, but not extra orders, delivery/DP, call-and-trade, account charges or special account offers; keep differences in the extra-charge reserve and verify actual costs.
- A live Monday broker-terminal comparison is still required. Off-hours tests establish connectivity, not a tradable setup, fill quality, profitability or a 70% win rate.
