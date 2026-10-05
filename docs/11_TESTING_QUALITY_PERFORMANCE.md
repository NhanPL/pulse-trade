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
