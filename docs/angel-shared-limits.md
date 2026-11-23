# Shared Angel request allowance

Angel support's email supplied by the owner on 23 November 2026 specifies 2 requests/second, 40/minute and 2,000/hour. The email does not say which endpoints share those limits. This app conservatively combines session login, full quotes and historical candles in one allowance. The three-stock strategy, scanner strategy, risk rules and all journal formats/storage keys are unchanged.

## Operation

- Every actual provider attempt, including login and retries, first reserves an atomic Redis slot. All workers, devices, local servers and updated deployments with the same Angel client code and Redis database share it.
- Rolling one-second, one-minute and one-hour windows are checked together using Redis server time. Requests are also spaced at least two seconds apart (at most 30/minute and 1,800/hour under normal sustained pacing). This deliberately leaves headroom below the reported caps.
- A single bounded timestamp set, keyed by a hash of the Angel client code, persists across server restarts. It contains request identifiers, timestamps and pause/initialization markers only. No broker API keys, login credentials, stock data or journals are stored there.
- The first connection, or loss of the entire ledger, pauses requests for 61 minutes 5 seconds. This allows an earlier untracked hour plus a 65-second in-flight grace period to clear. Ordinary deployments and overnight inactivity do not restart this wait. Do not delete or change the ledger key to bypass a wait.
- A rate-limited data read can retry at most twice, each through the shared gate, without a separate exponential cooldown. Explicit `Retry-After` is stored for all workers, including on the last failed attempt. Other transient data failures retry once. Login is never automatically replayed. Only the three approved endpoints are accepted; orders are rejected.
- Gate waits are bounded to 15 seconds per reservation and at most 12 checks. A wait over five seconds is returned immediately with a retry time. Provider attempts time out after seven seconds. Route deadlines remain bounded; failures do not fall back to stale candles.
- Missing configuration, Redis errors, malformed replies and uncertain writes stop that attempt before contacting Angel. There is no in-memory fallback and no refund of uncertain/aborted reservations.
- The scanner's **Angel request allowance** panel queries protected `/api/market/data-budget`. It shows a timestamped snapshot, counts and next-check time. Refreshing this panel consumes no Angel allowance. It is not a price-freshness or broker-health check.

## Deployment

1. Create an Upstash Redis database on the free plan where available. Connect it to this Vercel project. Keep persistence enabled and eviction disabled; do not share this database with a cache that might evict the ledger.
2. Set one complete server-only URL/token pair, in priority order: `ANGEL_RATE_REDIS_REST_URL` + `ANGEL_RATE_REDIS_REST_TOKEN`; `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; or integration-provided `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Incomplete higher-priority pairs fail closed. Use the write token, not a read-only token. HTTPS Upstash endpoints only.
3. Share that same pair with every environment that has this Angel client code. Unconfigured environments deliberately cannot contact Angel. Do not create a fresh database/key per deployment or API-key rotation.
4. Redeploy after connecting storage. Open the status panel to initialize and verify tracking, then allow the one-time wait to complete. Shut down old local versions and stop using old deployment URLs: they cannot participate in shared tracking. Keep only the current production URL in use.
5. Verify counters and a small read before a full scan. Provider-side shared-pool exhaustion can still cause errors within our limits; the limiter cannot guarantee Angel availability, data accuracy or trading outcomes.

The limits cover requests from this updated app. Broker-wide traffic, another application using the account, older deployments and multiple independent Redis databases are outside its visibility. Redis reservations precede network transmission; delivery timing is controlled by the network, so the extra spacing provides headroom rather than an absolute guarantee of upstream arrival times.

## Verification

`npm test`, `npm run typecheck`, `npm run build`.

Real Lua integration tests use a dedicated disposable Redis server bound to localhost with persistence disabled. Start one, then run:

```
REDIS_CLI_BIN=/path/to/redis-cli REDIS_TEST_PORT=16389 npm run test:redis
```

Tests use unique `angel-test:` keys and delete only those keys. They test simultaneous workers, rolling windows, boundary behavior, restart/idle persistence, lost-ledger initialization, clock regression and shared provider holds. No broker account or journal is accessed.

References: [Upstash REST API](https://upstash.com/docs/redis/features/restapi), [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage). The support email, rather than older public endpoint tables, is the source for the new numerical limits.
