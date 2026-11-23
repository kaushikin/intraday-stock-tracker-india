# Gold Petal background candidate alerts

The page can be closed after enabling a daily watch. QStash calls a dedicated server endpoint about once a minute; it uses the existing Angel readers and shared 2/sec, 40/min, 2,000/hour limiter. Web Push delivers a **candidate to verify**, never an approved entry, a broker order or an automatic paper record. Closed-page exit monitoring is not included: keep the existing visible exit assistant running after a paper entry.

## One-time setup

1. Open the production Gold Petal page in current Chrome, Firefox or Safari. An embedded browser may not support PushManager. Use the **Alerts with the page closed** panel.
2. In the existing Upstash account, open QStash and explicitly choose **Free**. The Redis Marketplace connection does not automatically configure QStash. If Free is unavailable or a paid plan is requested, stop.
3. Paste the QStash token into the password field in the signed-in app, confirm Free, and press **Connect free scheduler**. Do not send the token in chat. The server uses it to create/update the fixed `intraday-india-gold-petal-v1` schedule and discards it. No billing plan or subscription upgrade API is called.
4. Confirm today's outside losses/open risk in the existing pilot, including zero when applicable. Press **Enable today’s alerts + send test**, grant browser notification permission and confirm the actual test notification arrived. Candidate checks stay paused until this confirmation.
5. During 18:00–21:30 IST, verify a recent server contact and check result before closing the page. Enable again for each session. Stop alerts from the app at any time; to remove scheduled callbacks altogether, delete the named schedule in QStash.

The schedule is `* 12-16 * * 1-5` UTC: 300 callbacks per weekday, with zero scheduler retries. Outside the pilot's 18:00–21:30 IST session or without an active watch, callbacks do not request broker data. The currently published QStash Free allowance is 1,000 messages/day. Other QStash uses share that allowance. Vercel and Redis usage also count against their existing plans; this code does not promise unlimited free usage or change any plan. One deterministic schedule ID prevents duplicate setup schedules. The user confirms their actual plan in the dashboard.

## Qualification and daily risk

The frozen `planPetal` engine is reused unchanged. It checks completed-candle structure, fresh timestamped quotes, spread, contract expiry, MCX session, normal charges and full funding. Higher fees entered in the form become a floor in the watch; lower fees cannot override published costs. Model risk must be ≤₹150, model risk + confirmed daily losses/reserves ≤₹250, and full funding must fit current equity capped at ₹30,000. A watch requires readable books, a daily outside-risk declaration, no open paper position, and no pilot entry already made today. One candidate notification per exact contract/completed candle is reserved atomically in Redis, including uncertain deliveries, so the same candle is not replayed as a new opportunity.

The server receives only a narrow risk snapshot, not either complete stock journal. It cannot independently discover real broker trades or changes on another browser/device. Alerts explicitly refer to the **last confirmed daily allowance**. Users must stop/update the watch before any other trading. When this browser detects a change in either stock book or the pilot, its read-only guard invalidates the matching watch; a warning appears if invalidation fails. Higher fee inputs also stop a running watch. A concurrent change can race an in-flight notification, so fresh checks in the app remain mandatory for every entry. A notification never bypasses `openPetal` verification.

Watches expire at 21:30 IST and do not auto-renew. They pause until the user confirms a delivered test. No payment, broker or journal API is invoked by the scheduler. The only new browser key is `gold_petal_alert_watch_v1`; the existing stock books and study/watchlist are not written. Existing paper entry/exit behavior is preserved.

## Delivery, security and diagnostics

- Web Push uses a persistent VAPID key pair in separate Redis keys, plus a different random callback bearer secret. Neither private key nor callback secret is exposed by the status endpoint. The QStash setup token is never stored or returned.
- Setup/status routes keep existing app authentication. Setup mutations additionally require the production origin. Only the exact scheduler callback is exempted from login middleware, and it requires its own constant-time-checked bearer credential. Preview deployments cannot configure or run callbacks.
- Browser subscription destinations are restricted to supported HTTPS Apple, Google and Mozilla push endpoints; arbitrary URLs, user-info, custom ports and malformed keys are rejected.
- The shared callback lock suppresses duplicate calls inside 55 seconds. The existing Angel limiter still covers every actual broker request. Stale data/provider failures never create a candidate notification. Health and last check results are visible in the panel without returning raw provider errors or secrets.
- Candidate pushes have a 30-second TTL. A delayed payload is displayed as expired and instructs the user to recheck. Notification clicks open only the Gold Petal route, preserving other open forms. The service worker never reads/writes journals or fetches broker data.
- Browser/OS permission, Focus settings, network, sleep and provider delays can prevent delivery. Closing an app tab is supported; delivery after fully quitting the browser depends on the browser/OS. This is neither guaranteed real-time monitoring nor enforcement of a realised loss ceiling. After receiving a candidate, reopen, refresh and complete Angel/fee/event/risk verification before any paper entry.

## References

- [QStash Free pricing](https://upstash.com/pricing/qstash)
- [QStash schedule API](https://upstash.com/docs/qstash/api-reference/schedules/create-a-schedule)
- [Web Push Node library](https://github.com/web-push-libs/web-push)
- [Browser Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
