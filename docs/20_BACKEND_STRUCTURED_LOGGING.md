# P05 — Structured backend logging

## Scope

P05 adds JSON-line logs to the existing Nest API without a logging dependency,
external collector, database migration or change to trading transactions. It covers
HTTP completion/failure, provider lifecycle/retry, client connection lifecycle,
existing realtime failures and order creation/cancellation/background-fill errors.
Health endpoints and deployment infrastructure remain P06 and later tasks.

## Output and correlation

`node apps/api/dist/main.js` uses `StructuredNestLogger` for Nest framework output
and `BackendLogger` for application events. Each record has `timestamp` (UTC ISO),
`level`, `service: "pulse-trade-api"`, a fixed `context` and a fixed `event`.
Info/warn go to stdout; error/fatal go to stderr. Consumers should combine both
streams and parse one JSON object per line, not match prose.

Example with synthetic identifiers:

```json
{"timestamp":"2026-10-10T00:00:00.000Z","level":"error","service":"pulse-trade-api","context":"OrdersController","event":"orders.cancel_failed","requestId":"123e4567-e89b-42d3-a456-426614174000","orderId":"223e4567-e89b-42d3-a456-426614174000","errorCode":"ORDER_UNAVAILABLE"}
```

HTTP middleware generates a fresh UUID for every request; incoming `X-Request-ID`
is deliberately ignored. The ID is returned as `X-Request-ID` and exposed to the
configured browser origin through CORS. `AsyncLocalStorage` propagates only this
ID across awaited work; concurrent requests do not share context. Successful and
failed response bodies keep their existing contracts; no identity or body fields
are added to the correlation context.

`http.request_completed` records method, matched route **template**, status and
monotonic elapsed `durationMs`. Status 4xx is warn; 5xx is error. Preflight and
unmatched requests use `route: "unmatched"`, never the raw URL. A response closed
before completion emits `http.request_aborted` without inventing a success status.
Finish/close listeners are removed after the single terminal record.

`http.unexpected_error` records unexpected server failures before the completion
record. Existing `HttpException` envelopes are passed through unchanged. Other
exceptions retain Nest's statusCode/message shape; unexpected/library 5xx messages
are generic, while ordinary library 4xx statuses/messages remain intact. The filter
does not invoke Nest's default raw exception logger.

## Operational events

- `application.ready` includes the listening port. `application.start_failed`
  emits a safe fatal record and a nonzero exit status. Failed listen/initialization
  closes the created app. Configuration values are not printed.
- `provider.state_changed` reports CONNECTED/DISCONNECTED transitions;
  `provider.socket_closed` reports only numeric close code;
  `provider.reconnect_scheduled` includes attempt and delayMs. Socket/retry/startup
  failures have fixed labels, never endpoint, close reason or provider payload.
  Desired subscriptions and existing reconnect/backoff behavior are unchanged.
- `realtime.client_connected` / `realtime.client_disconnected` include the existing
  public `connection.ready` UUID and active connection count. IDs use a WeakMap and
  are explicitly removed on failed initialization/disconnect. Subscription errors
  use the server connection ID, not the client-supplied command request ID.
- `orders.create_failed` includes validated symbol, BUY/SELL, MARKET/LIMIT and
  allowlisted domain error code. A failed creation before commit has **no order ID**;
  its HTTP request ID is the correlation key. Cancellation and asynchronous
  `orders.fill_failed` include the existing UUID order ID. Background fills have no
  fabricated HTTP request ID. No user, quantities, prices or balances are logged.
- Remaining historical-candle, broadcast, freshness, subscription-cleanup and
  evaluator failures now use fixed event labels and safe metadata instead of raw
  exception messages. Expected domain conflicts are warnings, not exception dumps.
- Framework records preserve level and allowlisted Nest context; arbitrary framework
  messages/objects/stack arguments are discarded. Debug/verbose output is disabled.

## Privacy and bounded diagnostics

The logger reconstructs records from a narrow runtime metadata allowlist. It does
not serialize request/response objects, headers, bodies, query strings, route
parameter values, errors, causes, SQL, email/user IDs, tokens, passwords, cookies,
provider messages or financial state. Supported symbols, intervals, channels,
states, domain error codes and UUID identifiers are validated independently.

For exceptions, `error.kind` is fixed. `error.stack`, when available, contains at
most ten app-owned source coordinates under the API's existing `src/` or `dist/`
files. Exception messages/names, function names, absolute machine paths, generated
Prisma code, external URLs and third-party/internal frames are excluded. Input
inspection is capped at 12,000 characters and 40 stack lines; malformed/getter
stacks cannot prevent the safe event from being emitted. Missing safe frames omit
the stack instead of falling back to an unsafe raw value.

Malformed feed messages, provider/state/freshness listener errors, broadcast/send,
candle-bootstrap and evaluator/fill failures emit at most one record per fixed
event per logger per five seconds. The next emitted record includes `suppressed`
when repeats occurred. There is no flush timer; counts are not emitted if an event
does not recur. The map is bounded by nine fixed event keys, not symbols, users,
order IDs or payloads. HTTP completions, client/provider transitions, reconnect
attempts and foreground order failures are not sampled. No successful market tick
is logged, and feed ingestion/fan-out is never delayed by logging timers.

Synchronous writer/serialization failures are isolated from HTTP/trading/realtime
behavior. There is no application-owned retry/upload queue or log-file retention
implementation. These logs are operational diagnostics, **not** a complete trading
audit trail or a process-level crash reporter. Database orders/trades remain the
authoritative trading history. Collection, access control, stream backpressure,
retention and alerting belong to deployment operations; identifiers can still be
linkable and logs must remain private. Review/redact diagnostics and obtain explicit
approval before uploading them, as required by the existing diagnostics policy.

## Verification

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm --filter @pulse-trade/api test
pnpm --filter @pulse-trade/web test
pnpm build
pnpm --filter @pulse-trade/web test:e2e:realtime
```

The normal API test command discovers `backend-logger.test.mjs`,
`http-logging.test.mjs`, `provider-logging.test.mjs` and `startup-logging.test.mjs`.
They verify JSON fields/severity, strict privacy, safe bounded stacks, malformed
stacks, 100,000-repeat suppression, concurrent async correlation, abort listener
cleanup, real Nest HTTP/CORS/error responses, real order-controller failures,
background fill IDs, provider reconnect/re-subscribe, listener isolation, client
ID cleanup and the actual production entrypoint's failed-start exit behavior.
Provider tests use the existing socket-factory seam and no public network.

Existing business tests remain unchanged. The actual-WebSocket browser tests use
the shared HTTP configuration and existing gateway/broadcaster paths. CI also runs
the existing PostgreSQL integration and full-stack financial workflows. No test
sends diagnostics to an external collector or uploads artifacts.

Local validation on 2026-10-10 passed formatting, lint, workspace typecheck and
production build; all 180 API tests (17 new P05 tests), 171 frontend tests and five
actual-WebSocket desktop/mobile E2E tests passed. An unchanged frontend Sentry test
timed out during concurrent validation and passed when the full frontend command
was rerun alone; no timeout or assertion was changed. No local TEST_DATABASE_URL
is configured, so PostgreSQL integration/full-stack results are verified by the
existing GitHub CI workflow rather than claimed as local runs.
