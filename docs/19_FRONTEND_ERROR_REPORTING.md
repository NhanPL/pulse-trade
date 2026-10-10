# P04 — Frontend error reporting

## Scope

P04 adds opt-in production frontend error reporting using the official
`@sentry/browser` SDK. It does not add backend logging/ingestion, health endpoints,
deployment infrastructure, session replay, analytics or tracing (P05 onward).

## Configuration

In the web build environment, optionally set:

```dotenv
NEXT_PUBLIC_SENTRY_DSN=https://PUBLIC_KEY@YOUR_SENTRY_HOST/PROJECT_ID
NEXT_PUBLIC_APP_RELEASE=YOUR_COMMIT_SHA
```

Use the **public browser DSN** from the intended Sentry project. The key must be
32 hexadecimal characters, the project ID numeric and the URL HTTPS, without a
secret password, query or fragment. Never use a Sentry auth token. Empty/missing
DSN disables reporting. Development and server rendering never initialize the
browser reporter. Optional release labels accept 1–80 letters, digits, dots,
underscores or hyphens; use a commit/build identifier, not user information.
Startup/build validation rejects malformed configuration without sending it.

These `NEXT_PUBLIC_*` values are baked into the bundle: rebuild after changing
them. No real project credentials or external monitoring account were configured
as part of this task. Existing `.env` files remain untouched.

Before enabling a live collector, review the receiving project's retention,
access controls, data-scrubbing and IP-storage settings. HTTPS transmission still
exposes the network peer IP and browser-managed network metadata to the receiver;
the client payload allowlist does not guarantee anonymity. If deployment has a
CSP, allow only the intended ingestion origin in `connect-src`. Disabling the
DSN and rebuilding is the rollback; reporting is not required for trading.

## Ownership and flow

```text
Next instrumentation-client (before hydration)
  -> one isolated BrowserClient + Scope per document
  -> two document-lifetime error/rejection listeners

Next route/root error UI + chart boundary
  -> reportFrontendError

Existing realtime client/router diagnostic callbacks
  -> reportFrontendError

reportFrontendError
  -> allowlisted event -> bounded/deduplicated reporter
  -> final beforeSend allowlist -> Sentry fetch transport
```

`instrumentation-client.ts` initializes before React hydration. The route error
screen preserves the app shell; `global-error.tsx` supplies its own HTML/body and
theme when the root layout fails. Both expose a keyboard-accessible retry and
never display raw exception messages. The route fallback reminds users to check
an order's status before submitting it again, rather than claiming an interrupted
mutation did not happen.

The chart has a local boundary, so a render/effect error does not replace the
order form. Retry or a symbol/timeframe change clears its failed state; a healthy
chart is not remounted just to change timeframe. Normal historical-candle
loading/error/empty handling remains unchanged. React boundaries do not catch
arbitrary asynchronous callbacks; uncaught browser failures and isolated
realtime consumer failures have separate reporting paths.

Realtime diagnostics are optional callbacks on the existing application-owned
client/router, not additional sockets or React subscriptions. They report
unexpected socket loss/construction failure, failed sends and consumer failures.
Five consecutive reconnect attempts produce `realtime_reconnect_loop`; the
existing 30-second stable-connection reset restarts this count. Intentional
disconnects, duplicate callbacks from detached sockets and normal market ticks
do not produce diagnostics. Callback failure cannot block another consumer,
cleanup, reconnect or re-subscription. Route/symbol changes keep using the same
runtime and existing subscription cleanup paths.

The two global listeners have the document lifetime, not a route/component
lifetime; the initializer is idempotent. Their installer returns an explicit
cleanup function, exercised in tests. Monitoring adds no periodic timer,
WebSocket listener, Zustand subscription or React update per tick.

## Data allowed and deliberately omitted

Reports contain only fixed event-kind/page labels, severity, a standard error
class (or `FrontendError`), a fixed generic summary, grouping fingerprint,
timestamp/event ID, optional build release and SDK version metadata.

Stack parsing is limited to 12,000 characters and at most ten frames from
same-origin `/_next/static/…js` bundles. Only the bundle path, line and column
survive; function names, hosts, URL query/hash and non-bundle frames are removed.
Unknown routes become `other`; market symbols, user IDs and route query/hash
never become tags. Non-Error rejection values are never serialized.

No raw error message, component stack, account identity, email, password, token,
cookies, auth header, storage, DOM/form contents, order/portfolio values, provider
payload, request/response body, breadcrumb or URL is collected. The isolated SDK
has no integrations, automatic global handlers, sessions, replay or tracing.
All SDK `dataCollection` categories are explicitly disabled; the final
`beforeSend` removes SDK-added context and keeps only the application's safe
event fields. Transport uses `credentials: omit` and `no-referrer`.

This privacy tradeoff intentionally loses arbitrary messages and external/eval
stack detail. Use the kind/page/release and surviving minified bundle coordinates
to investigate. Source maps are not published/uploaded automatically, and full
deobfuscation or backend correlation is not provided in P04. Keep matching build
artifacts privately if a maintainer needs local debugging.

## Bounded behavior and failures

- At most ten reports per fixed 60-second window per document.
- At most ten grouping fingerprints retained in that window; reset on the next
  report after expiry. Error-object deduplication uses a `WeakSet`, including an
  error seen through both a global listener and a React boundary.
- Equivalent kind/page/class/bundle/line reports are deduplicated in the window.
- SDK transport has at most ten queued/in-flight envelopes and no persistent
  offline buffer. SDK client-outcome reports are disabled.
- SDK initialization, hostile error getters, synchronous sink errors and rejected
  sink promises are isolated. Monitoring does not alter the browser's error
  propagation, block the UI, retry trading mutations or recursively report its
  own transport failure.

Expected handled REST/business errors, validation failures, stale market states
and ordinary realtime updates continue using their existing local UI, not the
production exception channel. Diagnostics do not change authoritative balances,
orders or provider processing.

## Verification

Normal frontend test discovery covers:

- Own-bundle stack allowlisting, fixed route labels, arbitrary rejection/custom
  error-name removal and bounded frame count.
- Error-object/fingerprint deduplication, a 10,000-error flood, minute reset and
  synchronous/asynchronous/malformed-error failure isolation.
- Both global listener cleanup paths and unchanged browser propagation.
- Disabled development/no-DSN/SSR behavior, one SDK initialization, collection
  settings, final payload scrub and initialization failure.
- Chart-only fallback/retry, route reset by keyboard and recovery on reset-key
  change.
- Reconnect-loop threshold/stable reset, duplicate/intentional disconnects,
  failed socket construction/send and isolated client/router consumer failures.

`e2e/frontend-error-reporting.spec.ts` uses the production bundle and an
intercepted **local** synthetic Sentry collector, not a live Sentry account. At
1586px and 375px it creates actual uncaught errors/rejected promises, checks the
serialized SDK envelope and outgoing headers, floods error events to verify the
ten-report cap, and keeps login controls usable. A separate aborted-collector
scenario verifies keyboard validation and absence of a report loop.

Two additional desktop/mobile scenarios inject a one-shot chart initialization
failure, confirm the chart-only fallback/report while BUY/SELL remain enabled,
and retry by keyboard to restore the canvas. Synthetic local screenshots are
reviewed without publishing them. The existing handled-error accessibility test
scopes its alert to the main feature, excluding Next's separate route announcer.

The normal UI test build uses a synthetic localhost DSN. Full-stack/realtime
test builds explicitly disable reporting, so neither inherits a developer's live
collector configuration. Local reports/traces stay ignored and are not uploaded;
the diagnostic-sharing rules in document 11 still apply.

Run:

```text
pnpm --filter @pulse-trade/web test
pnpm --filter @pulse-trade/web test:e2e --workers=1
pnpm --filter @pulse-trade/web test:e2e:realtime
pnpm --filter @pulse-trade/api test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

Do not run the two Playwright build configurations concurrently because they
share `.next`. Full PostgreSQL transactional/full-stack integration remains in
the existing CI pipeline; P04 does not change it.

Local verification on 2026-10-10 passed 171 frontend tests (110 Node + 61 Vitest),
163 API tests, all 145 UI E2E tests using CI's single worker, and five actual-
WebSocket E2E tests. The chart fallback screenshots were visually reviewed at
desktop/mobile sizes. An earlier two-worker UI run exposed an existing register
keyboard/focus timing failure; unchanged registration tests passed on the
subsequent focused and full single-worker runs. A concurrent RTL run also hit
the existing five-second Recent Trades timeout; subsequent full runs passed.
No unrelated auth/trade behavior, timeout thresholds or assertions were relaxed.
Repository lint, formatting, workspace typecheck and production build also passed.

Implementation references: [Next client instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client),
[isolated Sentry clients](https://docs.sentry.io/platforms/javascript/best-practices/multiple-sentry-instances/),
[Sentry data-collection controls](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md#senddefaultpii-is-replaced-by-datacollection).
