# ₹10,000 cash plan: version 2 proposal

Historical proposal, accepted and implemented as `scanner-cash-3r-v2`. See the [active 3R protocol](scanner-3r.md) and `/cash-plan` for current behavior. The text below preserves the planning rationale; implementation now provides version separation and the new scanner entry rules.

## Decision

Small unleveraged cash-equity positions can fit ₹50 total planned risk under a proposed 3R target with larger cost reserves. This establishes feasible arithmetic, not the frequency of valid Nifty 50 setups, executable fills, profitability or 70% winners. Some days may have no suitable setup. Futures, CE/PE, borrowing and leverage are outside this proposal.

The former 2R/1.2-net-RR configuration permits at most ₹13.33 in combined costs and reserves at ₹50 risk. Where the standard minimum brokerage applies, it cannot accommodate the old ₹1 slippage plus ₹0.50 rounding defaults and statutory fees. Correcting the legal cap can reduce fees for tiny orders, but does not establish a practical intraday opportunity in them.

For gross stop risk D and conservative costs/reserves C, a 3R target gives planned risk D+C and net target reward 3D−C. Keeping net reward/risk at least 1.2 permits C up to ₹22.50 when the full ₹50 risk allowance can be used. Integer quantities, available cash, a late entry and execution filters can make the actual limit smaller. This is not a blanket ₹22.50 fee allowance.

## Fee correction shipped separately

For each buy and sell order, calculate the published lower of ₹20 or 0.1% with ₹5 minimum, then apply the exchange ceiling before GST. The ceiling is 2.5% of transaction value; for a share price at or below ₹10 it is ₹0.25 per share. Keep brokerage, exchange/IPFT, SEBI, sell-side STT, buy-side stamp duty and GST; do not duplicate IPFT. Round the total upward to paise and retain a separate day-level rounding reserve.

Example: one share bought at ₹100 and sold at ₹101 has brokerage ₹2.50 + ₹2.525, not ₹5 + ₹5. The model's total is ₹5.97 before reserves. This is an illustration of a legal cap, not a recommended stock or proof of a suitable setup.

The corrected calculator has a new calculation ID. Practice's charge checks and scanner entry proofs retain their original calculation version and estimates when restored. New scanner fee checks require the current version. Practice's entry fee guard now checks complete estimated round-trip charges at both stop and target instead of a partial brokerage/GST floor. No old trade is edited or reassigned to a different study.

Published estimates are not account certification. Compare both stop and target totals for the exact quantity with the broker calculator/account tariff. Add any higher verified charges. Extra orders, delivery/DP, account fees and special account plans need separate reconciliation. No real trade is needed to obtain an existing fee statement.

## Proposed rule changes

| Item | Existing version | Proposed separate version |
|---|---|---|
| Total planned risk | Lesser of ₹50, 0.5% equity and remaining loss headroom | Unchanged, including every cost and reserve |
| Cash | 95% of ₹10,000 baseline, no leverage | Unchanged ₹9,500 inclusive of costs; add ₹5,000 maximum purchase value per position |
| Target | 2× original chart stop distance | 3× original chart stop distance; reject any setup with known resistance before the full target |
| Minimum net reward/risk | 1.2 | Unchanged 1.2, using unrounded calculations |
| Execution reserve | Scanner default ₹1 for the whole trade | At least max(₹5, 2 × quantity × current spread, 2 × quantity × tick size, observed adverse-fill allowance) |
| Rounding reserve | Scanner default ₹0.50 | At least ₹1, increased if billing reconciliation requires it; add other verified charges separately |
| Observed spread | At most 10% of original stop distance | Unchanged |
| Spread plus reserve | Quantity × spread + reserve ≤10% of original gross stop risk | Proposed ceiling 25%; full allowance still included inside ₹50 |
| Entries | At most two combined entries/day | At most one entry/day in the initial new sample; one position across both journals |
| Time exit | Whole position after 30 minutes | Unchanged; do not wait longer to manufacture a 3R winner |

The 10% combined execution filter needs explicit revision: a ₹5 reserve alone requires at least ₹50 gross price risk under that filter, before charges. Thus keeping that filter while increasing the reserve would make the new plan impossible. The proposed 25% ceiling is a research choice, not an empirically validated threshold. Keep the independent observed-spread limit and skip when either limit fails.

Keep the current completed five-minute EMA20/VWAP pullback and NIFTY/stock 15-minute confirmation, warm-up requirements, fresh bid/ask/depth, event checks, entry window 09:45–11:15 IST, two-bar expiry and no-chasing rule. Lock the target from the trigger and original chart stop; a later ask cannot move the target farther away. The read-only illustrations assume an entry exactly at that trigger. Retain ₹100/day, ₹250/week, ₹500/month and ₹500 drawdown loss limits. Never narrow the chart stop just to buy more shares, scale into a loss, split into extra orders or remove costs to pass.

Larger target multiples generally make the target harder to reach; no win probability has been measured here. The ₹5/₹1 floors are provisional conservative planning choices, not proven upper bounds on fills or tax rounding. Raise them when evidence requires it. If a real spread/depth or adverse-price allowance exceeds the budget, reject the trade.

## Calculated illustrations

These use the corrected published-rate model, one buy and one sell, current spread/tick ₹0.05 each and no additional account fee. They are fictional price scenarios, not current quotes or trade recommendations.

| Example | Quantity | Buy value | Stop | Target | Fee + rounding + execution reserve | Planned loss | Net target profit |
|---|---:|---:|---:|---:|---:|---:|---:|
| Entry ₹200 | 15 | ₹3,000 | ₹198 | ₹206 | ₹12.90 + ₹1 + ₹5 | ₹48.90 | ₹71.10 |
| Entry ₹500 | 10 | ₹5,000 | ₹497.50 | ₹507.50 | ₹13.69 + ₹1 + ₹5 | ₹44.69 | ₹55.31 |

Both pass the proposed arithmetic and execution filters. The second example requires a 0.5% stop and 1.5% target move; it does not establish that an unobstructed setup will occur or reach target in 30 minutes.

For the first example, increasing the execution reserve to ₹8 raises planned loss to ₹51.90, so it fails. Reducing quantity to 13 lowers risk to ₹47.75 but leaves only ₹56.25 net target profit (net RR about 1.178), and fails the execution filter too. Honest sizing can therefore require skipping, not simply reducing quantity until the loss number fits.

## Before a new sample

1. Reconcile actual account charges and the updated estimate. Verify stock/index exchange timestamps, completed OHLCV, bid/ask and displayed depth with Angel One during regular sessions.
2. Use five supervised sessions for operational evidence: candidate quantity, spread/depth, actual chart stop, unobstructed 3R target, higher cost reserves, rejects and missed observations. Quote movements and paper prices do not prove real fills. With no real fills available, label the adverse-fill assumption as unvalidated and stress it upward.
3. Implement a new strategy version and segregated statistics before recording its trades. Preserve the three-stock v1 study, scanner v1 records and all old cost evidence. Do not combine old 2R trades with new 3R trades or retrospectively claim a target was filled.
4. If feasibility survives verification, freeze the new rules and collect forward paper evidence. Review at least 100 closed entries across at least 50 entry sessions, including time/manual exits, all losses, costs, net expectancy, profit factor, drawdown, adherence and missed entries. At one entry per day, 100 trades require at least 100 entry sessions; no-trade days lengthen the calendar further. No fixed daily profit or minimum trade count; no automatic approval at 70% or at the sample count.
5. If entries are scarce, maintain no-trade observations and review feasibility at a planned checkpoint. Do not force trades or silently relax fees, stop, target, timing or spread rules during the sample.

₹50 is a planned loss limit. Gaps, liquidity, delay and outages can produce a larger actual loss; an ordinary stop does not guarantee it. If ₹50 must be an absolute loss ceiling, continue paper trading. Live execution and a positive trading edge remain unverified.

## Primary sources

- Angel One tariff: https://www.angelone.in/exchange-transaction-charges
- SEBI stock-broker FAQ, question 19, maximum brokerage: https://www.sebi.gov.in/sebi_data/faqfiles/sep-2024/1727418208774.pdf
- NSE transaction/IPFT circular FA/73061: https://nsearchives.nseindia.com/content/circulars/FA73061.pdf
- Angel One calculator: https://www.angelone.in/calculators/brokerage-calculator
