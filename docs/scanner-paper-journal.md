# Scanner paper journal and Monday readiness

Open **Scan → Review paper entry → Scanner paper journal**. Scanner trades are exploratory cash-share paper trades. They have their own browser storage, trade history, observations, fee/comparison evidence, CSV and JSON backup. They never count toward Practice's 100-trade/50-session study. Study shares can only be entered in Practice. There are no broker orders.

New entries now use **3R v2**. The [active 3R protocol](scanner-3r.md) supersedes the previous scanner cost/default and entry-count rules. Old scanner 2R history and the three-stock Practice study retain their original records and separate statistics.

## Monday workflow (IST)

1. Before 09:45, sign in to this app and Angel One. Use the same browser/device that holds your journals. Confirm the existing three study shares in Practice; do not change them to chase scanner candidates. Check account tariffs, scheduled company events, available supervision time and your saved backups.
2. In Scan, keep realistic fees and reserves and run **Scan Nifty 50** between 09:45 and 11:15. Keep the tab visible while it loads. Zero candidates is valid. Select **Review paper entry** on a result; a result may be reviewed for data verification even when it cannot be entered.
3. Click **Capture scanner comparison**. The app displays the captured quote and completed stock/NIFTY five-minute OHLC, plus stock candle volume. In Angel One, open the same NSE cash share and NIFTY spot index, use standard five-minute candles and independently enter the exact completed bar and exchange quote times, prices and volume. Save within five minutes. At 09:45 the completed bar normally starts at 09:40, not 09:45. Missing required broker values leave verification pending. Do not copy the app values into the broker fields.
4. A matching comparison passes for that share and IST date only. A later failed comparison blocks further entries until a fresh comparison passes. Past recorded trades retain their original evidence. Freshness, setup and entry checks still apply at every entry.
5. Review the **journal plan using remaining combined budget**. Its quantity can be lower than the standalone shortlist quantity. Calculate broker charges at both stop and target using this exact entry and quantity. Enter total round-trip charges, source and reference under **Verify fees** and save. The scanner's planning reserve must cover the larger broker total plus tax-rounding reserve. Higher fees require increasing extra charges and rechecking; never lower costs to force qualification.
6. Recheck the selected share immediately before entry. A different entry/quantity/cost plan requires a new fee check. Fill event/supervision notes and tick the checklist. **Record scanner paper entry at ask** becomes available only when all checks pass. Saving re-evaluates against the current clock and latest stored journals. No retroactive trigger fills are created.
7. Supervise the open position in the scanner journal. Fresh quotes are requested about every ten seconds while the tab is visible during market hours. Alerts indicate an observed stop/target or the 30-minute time exit; they do not close the position. Use **Use current bid and time**, review the IST timestamp and total round-trip fee estimate, choose the actual exit reason, add source/gap notes, then **Record scanner paper exit**. Manual/time exits and mistakes stay in the sample. Quotes are observations, not verified executions. Do not invent missed fills or assume a stop price when the market moved through it.
8. If the feed fails, document it and use an independently observed Angel One bid/time for a manual record. Do not wait for an app alert to supervise an open position. Existing scanner exits remain possible if Practice storage becomes unreadable, provided the scanner journal itself is readable.
9. After 11:45, record skipped opportunities, data/fee mismatches, supervision failures and session findings in **Scanner observations and session notes**. Export **scanner backup JSON** (restorable) and optionally **scanner trades CSV**. Export Practice separately. Scanner notes and trades never increase the study's research counters.

## Shared safety, separate evidence

Both entry paths read the two journals under the same browser write lock. Initial combined simulated equity is ₹10,000, with at most 95% allocated as cash. Entry risk is at most ₹50 or 0.5% of equity and is reduced by remaining daily ₹100, weekly ₹250, monthly ₹500 and drawdown ₹500 limits. Only one paper position can be open across both journals. A 3R entry requires no earlier entry that day and blocks later entries across journals; Practice retains its two-entry maximum on days without 3R. Performance and observations are still reported separately. Practice retains its existing strategy and sizing calculation; the additional shared check may block its proposed size when the combined budget is smaller.

Limits use recorded closed P/L and do not guarantee a maximum real loss. Keep one device/browser for this pilot: Web Locks coordinate tabs on the same origin, not different devices or Vercel aliases. Do not run old tabs alongside the release; refresh them before Monday. Restore both journals when changing devices before recording new entries. An unreadable journal blocks new entries instead of assuming zero past losses.

Scanner JSON format 2 includes both strategy versions; format-1 backups remain readable without rewriting them. The results selector and CSV separate 3R from historical 2R; old open positions can still be closed. Scanner JSON has an explicit kind/version. Practice rejects scanner backups, including empty ones. Scanner restore merges matching records and rejects conflicting histories, malformed evidence and overlapping positions. It does not silently overwrite an existing closed trade with an older open backup. Raw export and explicitly confirmed recovery are available for unreadable scanner storage. There is no delete-history shortcut. Browser quota/write failures leave the previous scanner value intact. Settings' general backup does not include the scanner journal.

## Readiness review: fixed now and still pending

| Gap | Current handling / preparation |
|---|---|
| Scanner required an external notebook | Explicit entry/exit journal, observations, statistics and exports are now in Scan. |
| Detailed candle comparison required inspecting JSON | Captured OHLCV and independent broker comparison fields are now on screen. |
| Candidate fees were only generic estimates | Saved quantity/price-specific broker fee checks are required before scanner entry. Account billing is still not independently certified. |
| Two journals could reuse the same cash/risk | Combined entry safety limits, shared locking and open-position checks; study statistics remain separate. |
| Wrong backup could mix the samples | Separate schemas/import paths and rejection of cross-journal backups. |
| Hidden tab, device sleep, logout or provider outage | Visible-tab supervision only; explicit failures, manual observed exits and incident notes. Keep Angel One available and supervise. No closed-app stop protection. |
| Storage is local | Use one browser/device, avoid private sessions and export both backups. GitHub/Vercel deployment does not synchronize journal records. |
| Market data quality | Off-hours coverage is not a live validation. Complete Monday's independent timestamp/OHLCV/bid-ask checks before entries. |
| Events/corporate actions | Check the selected company's announcements/results and suspicious chart gaps manually; no authoritative automated event calendar is integrated. |
| Costs consume most of ₹50 | The active 3R scanner uses at least ₹5 execution and ₹1 rounding reserves, ₹5,000 maximum purchase value and net RR at least 1.2. Skip when full costs do not fit. |
| Calendar | Regular 2026 sessions only. Unknown years fail closed; verify/update 2027 before use then. |
| Statistical selection and supervision | Preserve failed/skipped attempts and prioritize the fixed study. Log missed study opportunities if scanner work prevents supervision. Review operations after five sessions; do not pool scanner winners into the study. |

Monday 23 November 2026 is a scheduled regular session; Tuesday 24 November is a holiday in the [NSE calendar](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf). Check current exchange notices before use. Actual account charges can be reviewed in Angel One Account → Trades & Charges; the broker says complete charges may appear after 1–2 working days. An existing comparable contract note is useful; no real trade is needed to obtain one. Sources: [Angel One charges guidance](https://www.angelone.in/support/charges-and-cashbacks/brokerage-charges), [broker calculator](https://www.angelone.in/calculators/brokerage-calculator).

This remains supervised paper research in long cash equities. Neither a shortlist, recorded paper result nor sample size establishes a 70% win probability or validates futures/CE/PE execution.
