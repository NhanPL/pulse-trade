# Identity and registration database models

I01 introduces only `User` and `Session`, mapped to PostgreSQL `users` and
`sessions`. See `docs/05_DATABASE_DESIGN.md` for the domain specification.

I03 adds `WalletBalance` as the direct prerequisite for registration funding.
J01 adds `Position`, `Order` and immutable `Trade` models with PostgreSQL enums,
financial CHECK constraints, ownership-preserving foreign keys and order/history
indexes. It is schema-only: market/limit execution and order HTTP endpoints remain
subsequent tasks. Wallets, positions and orders use `NUMERIC(38,18)`; the wallet
and position rows each have a unique `(user_id, asset)` key.

## Commands

From the repository root:

```sh
pnpm --filter @pulse-trade/api db:validate
pnpm --filter @pulse-trade/api db:generate
```

These commands do not need a database connection. API build and typecheck generate
the client automatically; generated files are ignored by Git.

For migrations, configure `DATABASE_URL` in `apps/api/.env` using the example in
`apps/api/.env.example`, or provide it through the process environment. Use a
PostgreSQL 14+ database dedicated to PulseTrade. The CLI loads the API environment
file; credentials must never be committed.

```sh
# Apply checked-in migrations to the configured database.
pnpm --filter @pulse-trade/api db:deploy

# Create a future migration against a local development database.
pnpm --filter @pulse-trade/api db:migrate --name describe_change
```

`db:migrate` also needs permission to create a shadow database. Use `db:deploy`
for deployment; migrations do not run automatically when the API starts.

## Storage rules

- Normalize email with trim/lowercase before storing or querying it. The unique
  email index prevents duplicates once callers follow this rule.
- Store only a password hash and a refresh credential hash, never the plaintext
  credentials. Registration uses the I02 Argon2id password service.
- Each refresh credential hash is unique; a user can own multiple sessions.
- Expiry is required. Revocation and last-use timestamps are nullable until those
  events occur. The `(user_id, expires_at)` index supports user-session queries.
- Deleting a user cascades to its sessions so no orphan credentials remain.
- Timestamps use `timestamptz(3)`. Prisma maintains `updated_at` on user updates;
  raw SQL callers must update that field themselves.

The client uses CommonJS output to match the API. `DatabaseModule` owns a shared
Prisma PostgreSQL adapter/pool, created lazily on the first registration request
and disconnected on module shutdown. The API package loads `apps/api/.env` before
Nest starts, while a `DATABASE_URL` supplied by the runtime environment takes
precedence. The Prisma CLI loads the same file independently. Without a database,
public market data remains usable and registration returns 503.

## Local login configuration

Registration can work without a JWT signing key, but login requires one. After
configuring `apps/api/.env`, run this once from the repository root:

```sh
pnpm --filter @pulse-trade/api auth:setup
```

This development-only command adds a random 256-bit `JWT_ACCESS_SECRET` to the
ignored local `.env` without printing it. It preserves existing valid keys and
database settings. Restart the API after changing its environment. Production
must supply a separate key through the deployment environment; no default or
automatically generated production key is used.

If login returns `503 LOGIN_UNAVAILABLE`, check the signing key and database
connection/migrations. `403 ORIGIN_NOT_ALLOWED` means `WEB_ORIGIN` differs from
the browser origin. After login, session restoration uses `POST /api/v1/auth/refresh`
followed by `GET /api/v1/me` with the returned bearer token.

## Backend integration test database

Use a dedicated PostgreSQL database whose name ends in `_test`, never the
development or production database. For disposable local PostgreSQL 16, start
the root `compose.test.yml` service, then copy `apps/api/.env.test.example` to
`apps/api/.env.test` (first setup only). The container uses loopback port 5433,
separate from the usual development port 5432, and keeps its data in tmpfs.

Commands from the repository root:

```sh
docker compose -f compose.test.yml up --wait --wait-timeout 60
pnpm --filter @pulse-trade/api db:test:check
pnpm --filter @pulse-trade/api db:test:prepare
pnpm --filter @pulse-trade/api test:integration
docker compose -f compose.test.yml down
```

`db:test:check` validates configuration only; it does not connect to PostgreSQL.
`db:test:prepare` validates the target before applying checked-in migrations with
`prisma migrate deploy`. `test:integration` builds contracts/API, applies the same
migrations and runs all existing PostgreSQL suites. Separate preparation is
optional, useful for inspecting the migrated schema; repeated deploys are safe.
No reset, seed, shadow database or application startup is required. Stopping the
Compose service discards its disposable data; do not store important data there.

The runner reads only `.env.test`, not the development `.env`. An explicit shell
`TEST_DATABASE_URL` takes precedence over the file. A legacy shell `DATABASE_URL`
is accepted only when neither supplies `TEST_DATABASE_URL`, and undergoes the
same guard. Empty explicit targets and `NODE_ENV=production` fail immediately.
Children receive `NODE_ENV=test` and the guarded target as `DATABASE_URL`; Prisma
does not load the development `.env` in that mode. URLs allow only PostgreSQL,
a single database name ending `_test`, `schema=public` and optional `sslmode`;
connection override parameters are rejected before any child command runs.
`.env.test` is ignored by Git and credentials are never printed by the runner.

CI provides a fresh PostgreSQL 16 service and supplies `TEST_DATABASE_URL` without
a local env file. It also starts/migrates/stops the disposable Compose database,
then runs the complete integration suite through the guarded commands. For detailed setup
and isolation rules, see `docs/11_TESTING_QUALITY_PERFORMANCE.md`, section O02.

Tests fail rather than skip when a test database is unavailable. Fixtures have
unique randomized identities and delete only their own rows, never truncate the
database. All Prisma/Nest connections are closed on completion. Tests exercise
the HTTP endpoint, concurrent duplicate registration, exactly-once funding and
rollback after a real database CHECK violation. Cleanup targets only the test's
randomly generated emails. Login tests additionally verify persisted session
hashes, signed access tokens, credential errors, cookie/CORS policy and failure
without a signing secret. They generate a temporary signing key in their own
process.
Refresh tests cover rotation/replay, concurrent refresh, concurrent revocation,
expired/revoked sessions, near-expiry lifetime caps and rollback of a failed
rotation. They reuse the existing Session model; I05 needs no schema migration.
Logout tests check idempotent revocation, isolation between sessions, expired and
unknown credentials, bearer verification, cookie removal and both refresh/logout
orderings. I06 uses the existing `revoked_at` field without a new migration.
I07 tests `/me` against live session state, including logout/refresh, invalid JWTs,
wrong session ownership, removed/expired/revoked sessions and removed users. The
endpoint only reads data and needs no new migration.
