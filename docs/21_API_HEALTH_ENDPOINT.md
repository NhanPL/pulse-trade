# P06 — API process health endpoint

## Scope and semantics

`GET /api/v1/health` is the process/API liveness endpoint specified by the API
and security/deployment documents. It proves the running Nest HTTP API can handle
a request; it does **not** assert database, market-provider or trading readiness.

The public response is HTTP 200 with `Cache-Control: no-store`:

```json
{ "data": { "status": "ok" } }
```

There are no credentials, query parameters or request-body fields to supply. Query
values, tokens and cookies cannot affect or be reflected in the fixed response.
The route creates no session/cookie and includes no hostname, version, process ID,
uptime, environment/configuration, connection URL, stack, account or financial data.
The existing HTTP boundary supplies a server-generated `X-Request-ID`, structured
completion logs and CORS for the configured web origin. Normal HEAD returns the
same status/cache headers without a body; normal browser preflight remains 204.

`HealthModule` owns a small controller and has no service/provider imports. It is
registered in the production `AppModule`, uses the existing `/api/v1` prefix and
does not introduce a root `/health` alias. The response type stays local because
this is an operational endpoint with no frontend consumer. No new package, env
variable, configuration flag, migration or shared-contract change is required.

The handler performs no DB query, external HTTP request, socket connect, subscription,
timer, cache update or trading mutation. Database/provider outages therefore do not
turn liveness red or introduce slow remote checks per probe. Existing authentication,
market freshness and authoritative trading validation remain unchanged. If the
process cannot start or the HTTP server is not responding, the caller receives a
connection/timeout failure instead of a cached success; configure a probe timeout.

## Local probe

Start the API using the existing runtime configuration, then run:

```bash
curl --fail --silent --show-error --max-time 5 \
  --header 'Cache-Control: no-cache' \
  http://localhost:3001/api/v1/health
```

In Windows PowerShell, use `curl.exe` (a single line is sufficient) if `curl` is an
alias. Use the actual configured port/base URL. Send probes to the API, not the
Next.js host. Do not attach auth cookies/tokens and do not configure an intermediary
to cache this route. Probe scheduling is infrastructure monitoring, not market-data
polling; no UI polling or WebSocket lifecycle changes are introduced.

The dependency diagnostics listed as P1 in the specifications (database connectivity,
`/health/market-data`, provider status and last market-update timestamp) remain
deferred. A future readiness implementation must stay separate from this liveness
semantics and keep public responses free of sensitive infrastructure details.
Hosting, production probe rollout and later deployment backlog tasks remain out of
scope. This endpoint alone must never authorize or enable a trading operation.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @pulse-trade/api test
pnpm build
```

Normal API test discovery includes `test/health.test.mjs`, with controller and real
Nest HTTP checks for the exact payload, prefix, no-store header, auth-free access,
absence of session cookies, normal CORS/HEAD, concurrent request correlation and
non-disclosure of supplied credentials/query data. An actual `AppModule` test uses
a failing provider and a DB accessor that throws on any use: repeated health probes
perform no additional provider activity or DB access, `/orders` still returns 401,
and existing listener ownership/cleanup remains intact. No public network, live
database or credentials are needed for these health tests. The existing CI workflow
also runs browser/full-stack E2E and PostgreSQL integration regressions.

Local P06 validation: formatting, lint, workspace typecheck and workspace build
passed; the backend suite passed all 185 tests, including five new health tests.
Browser/full-stack and live PostgreSQL regressions are left to the existing CI.
