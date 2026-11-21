# Monday verification checklist

For Monday 23 November 2026; all times are IST. Monday is a scheduled regular session and Tuesday 24 November is an NSE holiday. On later dates, verify the applicable trading calendar first. The app currently verifies regular 2026 sessions only.

Use paper mode throughout. A documented no-trade session is acceptable. A passed data comparison is not proof of a profitable strategy.

## Which shares and which scanner?

If you have not fixed a study universe yet, keep the app's existing defaults: **RELIANCE, TCS and HDFCBANK**. These are a consistent observation set, not instructions to buy. If Research readiness already says your study universe is fixed, keep those saved shares. The first saved research record fixes the list; later Watchlist changes do not change it.

**Practice is the screen to keep open.** It evaluates the fixed cash shares using the unchanged `cash-pullback-v1` rules and NIFTY confirmation. Quote requests run about every 10 seconds and candle requests about every 30 seconds while the tab is visible during regular market hours. Provider delays can make data stale. Entry eligibility is limited to 09:45–11:15. Hidden tabs pause polling, and the app does not monitor after you close it. It never places broker orders or automatically records paper fills.

The **Scan** tab now screens the official Nifty 50 list separately using its active 3R version and full ₹50 cost/risk filters. It has a separate paper journal and cannot change your study shares or add entries to the Practice journal. Use Practice for the existing three-share sample. Scanner candidates outside that list remain exploratory observations; do not switch study shares to chase them. See the [active scanner 3R rules](scanner-3r.md), [scanner operation](nifty50-scanner.md) and the [in-app scanner paper journal workflow and preparation review](scanner-paper-journal.md). Shared entry guards prevent using the same simulated cash/risk twice.

## 1. 08:50 — Open the workspace

Open [Practice](https://intraday-stock-tracker-india.vercel.app/signals), your Angel One terminal and the [Angel One brokerage calculator](https://www.angelone.in/calculators/brokerage-calculator). Refresh Practice and confirm Data status, Research readiness and Broker charges are visible. Confirm the study shares before saving the first research record.

## 2. 09:00 — Check the account's fee evidence

In Angel One, open Account → Trades & Charges. Use an existing comparable NSE cash intraday transaction or contract note with its exact executed buy price, sell price and quantity. Check account-specific brokerage offers or caps. Several orders or a delivery trade are not equivalent to the app's one-buy/one-sell model.

Angel One says full charges can take 1–2 working days to appear. If no comparable existing transaction is available, use the broker calculator and mark the result as an estimate. Actual billed account charges remain unverified. No real order is needed for this check.

## 3. 09:10 — Practise a charge comparison

In the broker calculator choose Equity → Intraday → NSE. For a hypothetical example, use buy ₹200, nine shares, and calculate sell ₹196 (stop scenario). Repeat with sell ₹208 (target scenario). Record TOTAL TAXES AND CHARGES, including brokerage; do not confuse it with brokerage alone, net P/L or buy value.

Enter the same figures in Practice → Broker charges. The app's standard published-rate estimates are ₹12.43 at stop and ₹12.46 at target. Save each broker result under Reconcile with your broker, with its source, date, matching exit price, broker total and a short reference. Investigate differences rather than forcing agreement.

With ₹1 slippage and ₹0.50 tax-rounding reserve, this example has ₹49.96 planned risk but about 1.162 net reward/risk. It fails the unchanged minimum of 1.2. Never reduce costs or reserves merely to make the example pass.

## 4. 09:35–09:45 — Match charts and inspect feed health

Open the same NSE cash share and NIFTY 50 spot index in Angel One. Select five-minute standard candles and IST timestamps. Read individual candle OHLC and stock candle volume, not cumulative daily volume. NIFTY supplies market confirmation; it is not an extra cash position.

Click Refresh data in Practice. Expand the share and NIFTY in Data status. Check Monday's exchange timestamps, quote freshness, available bid/ask, completed-bar history and matching stock/index candle times. An OK HTTP response alone does not prove current data. Stale Friday data, missing timestamps, insufficient history or provider failures leave verification pending. Optional Hugging Face billing/credit failure does not affect price qualification.

## 5. Around 09:45 — Record the independent comparison

In Research readiness → Supervised market-hours comparison, choose the share and click Capture app snapshot. At 09:45 the expected completed five-minute candle normally starts at 09:40; compare the exact start time shown. The 09:45 candle is still forming.

Immediately note Angel One's stock LTP and comparable exchange/feed timestamp, then independently enter the completed bar's start time, stock OHLCV and NIFTY OHLC. Never copy the app values into the broker fields or substitute your computer clock for missing exchange timestamps. If the terminal does not expose a required value, leave the check pending.

Save within five minutes. The app requires matching bar times, quote times within 30 seconds, stock prices within one tick, NIFTY OHLC within ₹0.01 and exact stock volume. Look for Comparison matched today. Repeat for each share you intend to paper trade. A later mismatch revokes today's pass. LTP differences may reflect movement between observations; capture a new comparison and investigate persistent completed-candle differences.

## 6. When a setup appears — Verify that trade's costs

Recalculate broker charges for the exact proposed quantity, current observed ask, stop and target. Run both stop and target exit scenarios. Use conservative costs covering both and an appropriate rounding reserve. The earlier ₹200 exercise does not verify a different trade.

In Before considering an entry, enter the planning charges including rounding reserve in Round-trip charges (₹), and slippage separately in Slippage reserve (₹). The Broker charges panel does not fill these automatically. If the proposed quantity changes, recalculate its costs. Keep account-charge uncertainty documented.

## 7. Before recording a paper entry

- Today's independent comparison has passed for this share.
- Quotes and completed candles are still current; the setup is eligible and unexpired.
- Total planned risk including costs and reserves fits the displayed remaining budget, at most ₹50.
- Net reward/risk passes 1.2 and cash, spread and depth checks pass.
- You checked scheduled company events, completed notes and can supervise the position.
- It is within 09:45–11:15; there is no open position and the two-entry daily cap is not reached.

Use the app's eligibility result, not a rounded displayed ratio. Record paper entry at ask only when every check passes. Otherwise use Log observation / skip. The app does not rank these shares by a reliable win probability or guarantee a qualifying trade.

## 8. Finish the session

Supervise any paper position and explicitly record its observed exit price, time, reason and estimated round-trip charges. Paper trades produce no broker contract note, so these costs remain estimates. Follow the existing stop, target and 30-minute time-exit rules.

After 11:45, record session findings, charge/data discrepancies, missed opportunities and rule adherence, then export the journal backup. Review operational problems after five observed sessions. Keep strategy rules and study shares unchanged. Assess performance after at least 100 closed paper trades across 50 entry sessions; counts alone do not establish a profitable edge or a 70% win rate.

## Sources

- [NSE 2026 holiday calendar](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf).
- [Angel One account charges guidance](https://www.angelone.in/support/charges-and-cashbacks/brokerage-charges).
- [Angel One published tariff](https://www.angelone.in/exchange-transaction-charges) and [broker calculator](https://www.angelone.in/calculators/brokerage-calculator).
- [Angel One chart reading](https://www.angelone.in/knowledge-center/share-market/how-to-read-stock-charts).
- [Angel One market-data timestamp definitions](https://smartapi.angelone.in/docs/MarketData).
