# Upstox comparison — verification only

Open **Scan → Angel One ↔ Upstox comparison** (`/market#upstox-comparison`). Compare one current Nifty 50 cash share and NIFTY spot manually. This panel keeps its snapshots in memory only. It does not change either journal, old trades, the three-stock study, scanner eligibility, broker comparison evidence, fee evidence, risk limits or entry/exit behavior. Angel One remains the scanner provider and its charge schedule remains in use. The demo is unchanged.

## Account and token setup

1. If you have no Upstox account, start with [Upstox's official account registration](https://upstox.com/trading-account/). Complete any onboarding, identity checks and approval directly with Upstox, reviewing account terms. The comparison panel can remain disconnected while this is pending.
2. Sign in to [Developer Apps](https://account.upstox.com/developer/apps). Under **Analytics**, choose **Generate Token → Confirm**, then copy the full token using the copy icon. Use the read-only Analytics Token. If a token already exists and is used elsewhere, reuse it instead of revoking it. Upstox documents a one-year validity and one active token per account.
3. In the existing Vercel project, choose **Settings → Environment Variables**. Set `UPSTOX_ANALYTICS_TOKEN` to that token, with **Secret** type and **Production** scope. Older dashboards may call the protection **Sensitive**. Never use a `NEXT_PUBLIC_` prefix, commit a token, or paste it in chat or journal notes.
4. Redeploy the latest production version after saving. Refresh the app and use **Check token setup**. **Token configured** means the variable exists, not that it is valid or live data has been verified.
5. Enter a cash symbol, such as `ONGC`, then choose **Compare feeds** during market hours. Token rejection, expiry, missing data, timeouts and rate limits appear explicitly. Replace a rejected/expired token in Vercel and redeploy; do not enter it into an app form.

The Analytics Token and covered data APIs are documented as free; this is not a promise about account-maintenance or other brokerage charges. Upstox currently documents no static-IP requirement for Analytics Token quote/historical-data calls. The adapter makes only GET requests to these two documented endpoints, with authorization stored on the server:

- `/v3/historical-candle/intraday/{instrument_key}/minutes/5`
- `/v2/market-quote/quotes?instrument_key=...`

Sources checked 23 November 2026: [Analytics Token](https://upstox.com/developer/api-documentation/analytics-token/), [intraday candles](https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/), [quotes](https://upstox.com/developer/api-documentation/get-full-market-quote/), [Vercel secret types](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types), [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

## What the comparison establishes

- The server resolves each cash instrument from the current official Nifty 50 ISIN (`NSE_EQ|ISIN`). NIFTY uses `NSE_INDEX|Nifty 50`; Angel tokens are never reused as Upstox keys. Returned quotes must identify the requested instrument.
- Angel and Upstox candle requests run independently. Both quote requests run after candle loading, close together in time. A failure in one source never borrows the other's data. This is not a provider failover.
- Only completed standard five-minute candles are displayed. The latest bars must have the same start time and be current. An older common candle is not substituted when the latest timestamps differ. Outside regular market hours, the comparison is labelled historical/stale.
- OHLC and stock volume are compared explicitly, with only a 0.000001 numeric serialization tolerance. Index volume is not compared. Differing volumes can require provider clarification; no threshold is loosened to manufacture a match.
- Provider feed time, last-trade time and local receipt time remain separate. Missing timestamps never count as current. Quotes expire after 30 seconds. They are separately sampled observations, not identical market ticks; the panel does not claim a quote-verification pass.
- Even **MATCH** refers only to that displayed candle. It does not prove full-history/indicator correctness, execution quality, profit probability or entry eligibility. The existing independent broker-terminal and account-specific fee checks remain necessary.

## Request control and persistence

Checks are manual, one share plus NIFTY, with a 30-second UI cooldown. They use the existing same-browser candle lock so they take turns with scans; background candle polling skips while the lock is held. Hiding the tab cancels the check. No requests are made to Angel or Upstox when setup is missing, aside from the app's own setup-status check. There is no full-universe Upstox scan, automatic retry loop, saved comparison, journal write or order endpoint. Upstox HTTP 429 applies a per-instance cooldown honoring Retry-After, and repeated clicks do not silently return cached provider data.

No live Upstox success may be claimed until a real Analytics Token has been configured and the deployed app has returned real comparison data. Fixture tests validate handling and isolation; they do not establish live provider reliability.
