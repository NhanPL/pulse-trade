# 11 — Testing, Quality & Performance

## 1. Testing pyramid for this project

Focus most unit tests on deterministic domain logic and a smaller number of E2E tests on critical workflows.

## 2. Frontend unit tests

Use Vitest for:

- Price/quantity format helpers.
- Order-book delta reducer/model.
- Bounded recent-trade buffer.
- Connection backoff calculation.
- P&L display derivation.
- Form schemas.

## 3. Frontend component tests

Use React Testing Library for:

### OrderForm

- Quantity required.
- Quantity > 0.
- Limit price required only for LIMIT.
- Insufficient-balance backend error display.
- Submit loading state.
- Market/Limit tab behavior.

### ConnectionStatus

- Connected.
- Reconnecting.
- Stale.

### MarketTable

- Search.
- Sort.
- empty search result.

### OrdersTable

- Pending order shows cancel action.
- Filled order does not show cancel action.

## 4. Backend unit tests

Prioritize pure domain functions:

- weighted average cost.
- realized P&L.
- limit trigger predicate.
- reservation amount.
- supported-market parsing.

## 5. Backend integration tests

Critical cases:

### Registration

- Creates user + USD balance atomically.
- Duplicate email rejected.
- Initial funding not duplicated.

### Market BUY

- Success.
- Insufficient USD.
- Stale market data rejected.

### Market SELL

- Success.
- Insufficient asset.

### Limit BUY

- Funds move available -> locked.
- Cancellation returns lock.
- Fill consumes lock and releases price improvement remainder.

### Limit SELL

- Asset moves available -> locked.
- Cancellation returns lock.
- Fill consumes locked asset.

### Concurrency

- Two concurrent orders cannot overspend one wallet.
- Two evaluators cannot fill one pending order twice.

## 6. E2E tests

Use Playwright.

### E2E-01 — Registration and market BUY

1. Register.
2. Verify authenticated state.
3. Open BTC-USD.
4. Enter market BUY quantity.
5. Submit.
6. Verify success.
7. Open portfolio.
8. Verify BTC holding exists.

### E2E-02 — Limit order cancellation

1. Login seeded user.
2. Create limit BUY away from current market.
3. Verify order PENDING.
4. Verify USD locked amount.
5. Cancel.
6. Verify CANCELLED.
7. Verify locked amount released.

### E2E-03 — Watchlist

- Add symbol.
- Reload.
- Verify persistence.
- Remove symbol.

## 7. Realtime tests

Use a deterministic mocked realtime server/provider in tests.

Test:

- Snapshot then delta.
- Reconnect.
- Re-subscribe after reconnect.
- Duplicate subscription prevention.
- Stale timeout.
- Order-book sequence gap recovery if implemented.

Do not make CI depend on public exchange uptime.

## 8. Performance targets

Avoid fake enterprise SLAs. Use practical measurable targets.

Suggested local/demo goals:

- No visible UI freeze during normal market update rates.
- Chart pan/zoom stays smooth.
- Order-book updates do not cause whole trading page re-render.
- Recent trade list remains bounded.
- Route switching does not increase active socket listener count indefinitely.

## 9. Performance verification

Use React Profiler to compare before/after an optimization.

Document at least one case, for example:

```text
Before:
Every ticker update re-rendered TradingPage + ChartPanel + OrderForm.

After:
Narrow Zustand selectors isolated price updates to MarketPrice and dependent widgets.
```

This evidence is valuable in a portfolio README/interview.

## 10. Order-book performance strategy

Separate:

- ingestion frequency.
- presentation frequency.

Example:

- Apply every valid delta to in-memory map.
- Derive top 20 rows at `requestAnimationFrame` or controlled interval.
- Update React row view only when derived top levels change.

Measure before choosing a throttle interval.

## 11. Quality gates

Pull request/CI should fail on:

- Lint error.
- Type error.
- Unit/integration test failure.
- Build failure.

Production deployment should not happen from an unverified broken branch.

## 12. Accessibility checklist

- Tab order logical.
- Inputs have visible labels.
- Errors linked using accessible descriptions.
- Focus restored/managed for dialogs/drawers.
- Buttons have accessible names.
- Data tables use headers.
- Profit/loss includes text signs, not color only.
- Mobile touch targets are usable.

## 13. O01 — Frontend test setup

`apps/web/vitest.config.mts` configures Vitest with React JSX transformation,
jsdom and the same `@/` source alias as the Next.js application. The config is
explicitly ESM and included in the web TypeScript check. Test APIs are imported
from `vitest`, not injected as globals.

`src/test/setup.ts` registers the Vitest-specific jest-dom matchers, unmounts RTL
renders after every test and restores real timers. Mock calls, spies, stubbed
globals and stubbed environment variables are reset by the runner configuration.
Use `@testing-library/user-event` for user interactions and prefer queries by
accessible role/name over implementation selectors.

Commands from the repository root:

```text
pnpm --filter @pulse-trade/web test        # Existing Node suites, then Vitest/RTL
pnpm --filter @pulse-trade/web test:unit   # One non-interactive Vitest run
pnpm --filter @pulse-trade/web test:watch  # Interactive Vitest watch mode
pnpm --filter @pulse-trade/web test:legacy # Existing Node suites only
```

The Vitest commands build the shared contracts first, so future tests can import
the workspace package on a fresh checkout without relying on leftover build files.
New Vitest files are colocated under `src/` as `*.test.ts` or `*.test.tsx`.
Playwright `e2e/*.spec.ts`, generated `.next/` files and the existing
`test/*.test.mjs` Node suites are not collected by Vitest. An empty collection
fails rather than silently passing. The existing 106 Node tests remain unchanged;
there is no broad runner migration in O01.

The initial smoke coverage verifies TypeScript/alias loading for a pure formatter,
React rendering and jest-dom assertions, keyboard activation, loading/disabled
buttons, empty-state semantics and cleanup between renders. GitHub CI runs both
frontend suites through the default `test` command. Browser tests remain the
authority for responsive layout and Next.js async Server Components.

Dependencies are pinned as dev dependencies. jsdom 29.1.1 is deliberately used
because it supports the existing local Node 24.14.1 runtime; jsdom 30.1.2 requires
a newer Node 24 patch. O01 does not upgrade Node, alter application behavior,
configure a backend database or add the later backlog E2E scenarios.

Setup references: [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest),
[RTL setup/cleanup](https://testing-library.com/docs/react-testing-library/setup/)
and [jest-dom's Vitest integration](https://github.com/testing-library/jest-dom#with-vitest).

## 14. O02 — Backend integration test database

Backend integration suites use real PostgreSQL and the checked-in Prisma
migrations, not an in-memory substitute. O02 adds repeatable local provisioning
and a guarded command shared with CI; existing business scenarios and fixture
cleanup remain unchanged.

### Local setup

Requirements: the repository's Node/pnpm versions, installed workspace
dependencies and Docker with Compose v2. From the repository root:

```sh
# First setup only: copy the template without overwriting an existing test config.
cp apps/api/.env.test.example apps/api/.env.test
docker compose -f compose.test.yml up --wait --wait-timeout 60
pnpm --filter @pulse-trade/api db:test:check
pnpm --filter @pulse-trade/api test:integration
```

PowerShell can use `Copy-Item apps/api/.env.test.example apps/api/.env.test` for
the copy step. Do not commit the resulting `.env.test` or use production
credentials. The template's password is for this disposable local service only.

`compose.test.yml` runs PostgreSQL 16 as a separate Compose project. It binds
only to `127.0.0.1:5433`, uses the `pulse_trade_test` database and a health check,
and stores data in container tmpfs rather than a development volume. The `--wait`
step waits for a healthy database before test commands start. To discard this
test database after a run:

```sh
docker compose -f compose.test.yml down
```

The next `up` starts empty; `test:integration` reapplies the checked-in migrations.
No global database reset or fixture seed is performed. Never put useful data in
this ephemeral service.

### Configuration and safety

`apps/api/scripts/integration-test-database.mjs` is the common entry point for:

```text
pnpm --filter @pulse-trade/api db:test:check   # Validate target; no DB connection
pnpm --filter @pulse-trade/api db:test:prepare # Guard, then deploy migrations only
pnpm --filter @pulse-trade/api test:integration # Guard, build, migrate, run suites
```

The target is resolved in this order: shell `TEST_DATABASE_URL`, `.env.test`
`TEST_DATABASE_URL`, then a legacy shell `DATABASE_URL`. An explicitly empty
target fails instead of falling back. The runner never reads the development
`.env`; Prisma also skips that file for these `NODE_ENV=test` child processes.
Use the guarded preparation command, not the development `db:deploy`, for test
setup. `db:test:prepare` is optional because `test:integration` already deploys
migrations; repeated deployment is idempotent.

Preflight rejects production mode, malformed/non-PostgreSQL URLs, database names
not ending `_test`, multiple path segments, fragments, non-public schemas and
query parameters that could override the connection target. Supported parameters
are `schema=public` and `sslmode` (`disable`, `prefer`, `require`, `verify-ca`,
`verify-full`). Duplicate parameters are rejected. This is an accident guard,
not permission to point tests at important data just because its name ends
`_test`: always provision a dedicated database/user.

Every build, migration and suite receives the same guarded `DATABASE_URL` with
`NODE_ENV=test`. Child commands use argument arrays without a shell, and credentials
are passed only through the environment, not printed in diagnostics or command
arguments. A bad target, failed migration or missing database fails the command;
tests are never skipped or reported as successful in those cases. The runner
only uses `migrate deploy`, never `migrate reset` or `migrate dev`.

Existing suites create randomized fixture users, clean up only owned rows and
close their Nest/Prisma instances. Authentication suites generate temporary JWT
keys, so no production signing secret is needed. Tests use existing deterministic
market inputs and must not depend on Coinbase availability. This task adds no
new E2E scenario or realtime-provider abstraction.

### CI and regression coverage

GitHub CI provisions fresh PostgreSQL 16 with `pulse_trade_test`, supplies
`TEST_DATABASE_URL` and runs guarded migration/integration commands. A separate
smoke check starts the local Compose service, migrates its database and stops it
on exit, verifying the disposable setup even on machines without local Docker.
No development env file or database is required. CI's service container is
discarded after the job. A custom local/CI PostgreSQL instance can be used
instead of Docker by supplying a dedicated `TEST_DATABASE_URL`; migrations need
normal schema creation permissions, not permission to create a shadow database.

`apps/api/test/integration-test-database.test.mjs` runs with the existing API unit
command and covers URL safety, env precedence/isolation, preflight before child
execution, command ordering, Windows/Node pnpm launchers, secret-free diagnostics
and failure/exit-code propagation. These tests require no database; the existing
PostgreSQL integration suites remain the check for actual migrations and behavior.

Provisioning references: [Compose services, health checks and tmpfs](https://docs.docker.com/reference/compose-file/services/)
and [Compose up health waiting](https://docs.docker.com/reference/cli/docker/compose/up/).

## 15. O03 — Playwright configuration

`apps/web/playwright.config.ts` owns the browser test runner. The existing pinned
Playwright dependency is reused; this task adds no library or application change.
Every `e2e/**/*.spec.ts` file is discovered automatically instead of maintaining
an explicit list. Vitest and Node unit suites stay on their own runners.

### Commands

After installing workspace dependencies, install the configured browser once:

```sh
pnpm --filter @pulse-trade/web exec playwright install chromium
# Linux CI also installs the browser's operating-system dependencies:
pnpm --filter @pulse-trade/web exec playwright install --with-deps chromium
```

Commands from the repository root:

```text
pnpm --filter @pulse-trade/web test:e2e          # Build isolated contracts/web, then run all E2E
pnpm --filter @pulse-trade/web test:e2e --list   # List discovered tests without starting a server
pnpm --filter @pulse-trade/web test:e2e register.spec.ts # Target one existing suite
pnpm --filter @pulse-trade/web test:e2e:ui       # Open interactive Playwright UI
pnpm --filter @pulse-trade/web test:e2e:report   # Open the last local HTML report
```

`test:register` and `test:login` remain targeted aliases, while the historically
named `test:auth` preserves its existing behavior of running the entire suite.
The Playwright-owned server command builds contracts/web on every invocation
that starts the server, so a fresh checkout and application changes need no
manual preparation. `--list` only collects tests and performs no build/startup.
The normal workspace production build is still checked separately in CI.

### Runtime and isolation

The single `chromium` project is headless by default and keeps the existing
1586 × 992 desktop viewport. Existing specs explicitly resize their pages for
mobile cases; no duplicate browser/mobile matrix is introduced. Tests run fully
parallel with at most two local workers and one CI worker. Automatic retries are
disabled and focused `test.only` calls fail CI rather than silently narrowing
coverage. The test/expect timeouts remain 30s/5s; individual actions are capped
at 10s.

Playwright builds and starts a production `next start` server bound to loopback port 3100,
waits for `/register` readiness (up to 120s), and uses
`http://localhost:3100` for relative navigation. It never reuses an existing
server, including locally: keep port 3100 free instead of accidentally testing
a development build or someone else's session. Playwright owns shutdown; Unix
gets SIGTERM with a 5s grace period and Windows uses Playwright's normal process
cleanup. Tests do not need a separately started frontend server.

The server command pins the build-time `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_WS_URL` to that same owned localhost:3100 server (`/api/v1` and
`/realtime`). Browser fixtures intercept those URLs; unhandled requests cannot
reach a development/production backend or receive unexpected live tickers.
Next itself does not implement these backend endpoints. The settings apply only
to this test build, not application defaults or env files. A runtime-only override
would be insufficient because Next inlines `NEXT_PUBLIC_*` into client bundles.
This isolation is necessary even when an API is already running locally on 3001;
no provider mock, backend service or new port is introduced. A normal `pnpm build`
restores a regular deployment bundle after E2E when needed.

Default Playwright fixtures provide a new browser context per test. The setup
smoke suite verifies browser/viewport/navigation, the isolated API target and that cookies,
localStorage and sessionStorage do not carry over between tests, including
sequential single-worker runs. No shared persisted authentication state is used.

Existing browser specs intercept API responses and selected WebSocket events;
they do not start the Nest backend, fund real database users or replace backend
integration tests. O03 brings the previously unlisted `trading-order-form.spec.ts`
into collection, supplies its missing portfolio fixture and updates stale
selectors/feedback expectations to the current UI. Its original pending-submit,
single-request, cleared-input, guest redirect and mobile checks remain intact.
No registration-to-BUY, limit-cancel or watchlist full-stack scenario, and no new
mocked realtime-provider abstraction, is implemented here (O04–O07 remain separate).

### Diagnostics and CI

Each run creates `apps/web/playwright-report/index.html`; the report never opens
automatically. Test attachments go to `apps/web/test-results/`. Failing tests
retain traces and capture screenshots, while passing-test traces are discarded.
The existing screenshot captures in feature specs are preserved. Both output
directories are ignored by Git. Trace inspection is available through
`pnpm --filter @pulse-trade/web exec playwright show-trace <trace.zip>`.

CI installs Chromium, runs the same E2E command and prints progress to its log.
Reports/attachments remain on the executing machine: there is no automatic
artifact upload. Traces and screenshots can include test credentials, cookies
and request headers; review them and obtain explicit approval before sharing
them outside that machine. Never record tests against production accounts.

Configuration references: [Playwright configuration](https://playwright.dev/docs/test-configuration),
[web server lifecycle](https://playwright.dev/docs/test-webserver),
[browser isolation](https://playwright.dev/docs/browser-contexts)
and [CI setup](https://playwright.dev/docs/ci). Test-build isolation follows
[Next.js public environment-variable inlining](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser).

## 16. O04 — Registration and market BUY full-stack E2E

`apps/web/e2e/full-stack/registration-market-buy.spec.ts` implements E2E-01
against the real Nest application and PostgreSQL, without intercepting browser
REST responses or WebSocket messages. Registration creates the user and initial
funding through the production service; it does not create a session, so the test
follows the documented success link and signs in before buying.

The scenario checks:

- Exactly one USD wallet with $10,000 available, nothing locked, and no initial
  session/order/trade/position, directly in PostgreSQL.
- Real login, authenticated navigation, and the HttpOnly refresh cookie.
- A MARKET BUY of 0.01 BTC at $50,000, producing one FILLED order and one $500 trade.
- Portfolio query invalidation after BUY, $9,500 available USD, 0.01 BTC, $50,000
  average cost, $500 market value and $10,000 total portfolio value.
- Reload through real refresh rotation and `/me`, then persistent account data
  with no duplicate fill/funding and no credentials in browser storage.
- No browser runtime errors during the flow.

### Run locally

Use the dedicated O02 database setup above, not a development API or database.
After installing Chromium and starting the test PostgreSQL service:

```text
pnpm --filter @pulse-trade/web test:e2e:full-stack
pnpm --filter @pulse-trade/web test:e2e:full-stack --list
```

The command calls API `test:e2e:prepare` to build contracts/API and deploy checked-in
migrations using the O02 database guard. The added `prepare-e2e` mode passes the
same guarded URL and `NODE_ENV=test` to all three child commands, so even Prisma
generation does not read the development `.env`; it does not run integration suites.
Then it builds and starts the web app on `127.0.0.1:3110`. Its build-time
API/WS targets are the owned test API on `127.0.0.1:3111`; keep both ports free.
The automatic test-scoped Playwright fixture starts a fresh API and waits for a
real database query before each test. It starts before the browser context and
closes after context teardown, so active sockets cannot outlive their API owner.
`--list` only collects scenarios and needs no database.
There is one Chromium worker, no retries and no reuse of existing servers.
The web server startup timeout is 180 seconds and the scenario timeout is 60 seconds.

`TEST_DATABASE_URL`/`.env.test` resolution and the `_test`/production-mode guards
are reused from O02. The harness never reads the development `.env`, seeds wallets,
resets a database or needs production JWT keys. Each test generates a signing key
and unique fixture email. Test teardown removes only that email's trading rows
and user (sessions/watchlist items cascade), closes Nest/Prisma and provider
timers/listeners, and restores the process environment, including after an
assertion failure. A forcibly killed runner can leave its uniquely named test
account; do not use useful data in
the disposable database. Missing PostgreSQL, unsafe configuration or an occupied
API port fails instead of skipping the scenario.

### Determinism and scope

The only Nest override is `MARKET_DATA_PROVIDER`, through the matching pinned
`@nestjs/testing` dev dependency. The existing AppModule, HTTP CORS/prefix, `ws`
adapter, gateway, cache, freshness checks and all auth/trading/portfolio services
remain real. A small test-only O04 fixture supplies fixed BTC tickers every second
and matching bounded candle history. This is a direct prerequisite for authoritative
market execution and portfolio valuation without Coinbase uptime/price variation;
it does not disable stale-market validation or add a production test mode.

This fixture is not the general realtime simulation/reconnect/delta infrastructure
in O07. O05/O06 reuse it for limit cancellation and watchlist scenarios below.
Existing mocked UI tests still use `playwright.config.ts` on port 3100; that runner explicitly excludes
the full-stack directory. Do not run both configs simultaneously: they build the
same Next output with different public targets. Run a normal `pnpm build` when a
regular deployment bundle is needed afterwards.

CI runs both suites separately using its disposable PostgreSQL service. The
full-stack HTML report and failure attachments stay under ignored
`apps/web/playwright-report/full-stack` and `apps/web/test-results/full-stack`;
no reports, test credentials or traces are uploaded automatically.
API unit coverage checks the fixture's valid fixed ticker, idempotent connect,
listener cleanup, interval-aligned history, production-mode refusal, real gateway
wiring and safe preparation before builds/migrations.

Harness reference: [Nest testing and provider overrides](https://docs.nestjs.com/fundamentals/testing).

## 17. O05 — Limit cancellation full-stack E2E

`apps/web/e2e/full-stack/limit-cancel.spec.ts` implements E2E-02 on desktop
(1586 × 992) and small mobile (320 × 800). Run it with the O04 full-stack command
above. O05 added two tests alongside the registration/market BUY scenario; O06
adds the two watchlist tests below. CI executes the combined suite against
disposable PostgreSQL.

Each cancellation test registers its own account through the real API, verifies
exactly one $10,000 USD wallet, then logs in through the UI and follows the intended
BTC trading route. The test-only provider keeps BTC at $50,000; a LIMIT BUY of
0.02 BTC at $40,000 cannot cross that price, while the real pending-order evaluator
and market freshness checks remain enabled.

The scenario verifies:

- One PENDING LIMIT BUY, $9,200 available USD and $800 locked, with no BTC
  balance, position or trade. Shared contracts validate the real responses and
  direct PostgreSQL reads confirm the reservation's asset and exact amount.
- The portfolio's separately labeled available/locked/total amounts, desktop
  order table or mobile cards, and confirmation price/quantity.
- Dismissing confirmation sends no cancellation and leaves balances/order intact.
  Keyboard confirmation sends exactly one cancellation request.
- The order disappears from Open Orders and becomes CANCELLED in History;
  portfolio invalidation restores $10,000 available and zero locked.
- Real session refresh after reload retains the released balance and cancelled
  history without duplicate funding, fills, trades or cancellation requests.
- No browser runtime errors, and no horizontal orders-page overflow at either viewport.

The O04 harness adds only a read-only, account-scoped reservation lookup. Cancelled
orders retain their reservation metadata for auditing; release is verified from
the wallet, not by incorrectly expecting that historical amount to become zero.
Automatic test-scoped API/account fixtures prevent the market BUY and both limit
scenarios from sharing users, balances, signing keys or listeners. Cleanup remains
restricted to each unique fixture email, including when a test fails.

There are no browser response intercepts, production code changes, new dependencies
or live Coinbase calls. Existing mocked cancellation/race tests and PostgreSQL
transaction/concurrency tests remain separate and unchanged. Watchlist E2E (O06)
and general realtime mocking (O07) are not part of O05. Report/trace sharing follows
the existing diagnostics restrictions above.

## 18. O06 — Watchlist full-stack E2E

`apps/web/e2e/full-stack/watchlist.spec.ts` implements E2E-03 on desktop
(1586 × 992) and small mobile (320 × 800). It reuses the existing full-stack
command, guarded test database, test-scoped API/account lifecycle and fixed BTC
market provider. The combined O04/O05/O06 runner collects five tests; the same CI
step runs all of them against real Nest services and disposable PostgreSQL.

Each test creates its own account through the real registration API. It verifies
that an unauthenticated `/watchlist` visit redirects to login without requesting
the private list, then signs in through the UI and follows the intended route.
No browser REST responses, WebSocket messages or database services are intercepted.

The scenario verifies:

- The new account's server-confirmed empty state and keyboard-accessible Explore
  Markets action, then a keyboard save through the Market Overview BTC star.
- Exactly one POST containing only `symbol`, one PostgreSQL watchlist row and the
  same public item ID/save time in the add response and reconciled GET.
- Real refresh-cookie bootstrap, `/me` identity verification and a fresh `no-store`
  watchlist GET after reloading both Markets and Watchlist. The star and saved row
  persist without replaying POST or using a browser-persisted private cache.
- A $50,000 BTC quote and live status received through the actual gateway after
  Watchlist reload; the membership REST contract contains no market prices.
- Keyboard removal through the Watchlist control returns an empty 204, reconciles
  to an empty GET and deletes the owned PostgreSQL row exactly once.
- Reload preserves removal, resets Total Watched to zero and renders the guided
  empty state with no market subscriptions. Desktop/mobile remain within the page width.
- No browser runtime errors, no private data in browser storage, an HttpOnly
  refresh cookie and unchanged $10,000 USD funding with no orders/trades/positions.

The harness adds only an account-scoped read-only watchlist lookup, selecting public
item fields in the API's documented order. Existing cleanup cascades the owned
user's watchlist items on any test failure; no database-wide deletion is added.
No production code, new dependency, general realtime simulator (O07) or broader
accessibility review (O08) is introduced. Existing mocked watchlist loading/error,
account-isolation and subscription lifecycle tests remain unchanged, alongside
the real PostgreSQL watchlist integration suite. Report sharing follows the
existing diagnostics restrictions above.
