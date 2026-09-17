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

## Authentication integration tests

Use an isolated PostgreSQL database whose name ends in `_test`, supply its
`DATABASE_URL` in the process environment and run:

```sh
pnpm --filter @pulse-trade/api db:deploy
pnpm --filter @pulse-trade/api test:integration
```

Tests fail rather than skip when a test database is unavailable. They exercise
the HTTP endpoint, concurrent duplicate registration, exactly-once funding and
rollback after a real database CHECK violation. Cleanup targets only the test's
randomly generated emails. Login tests additionally verify persisted session
hashes, signed access tokens, credential errors, cookie/CORS policy and failure
without a signing secret. They generate a temporary signing key in their own
process. CI provisions PostgreSQL 16 and runs the authentication suites.
Refresh tests cover rotation/replay, concurrent refresh, concurrent revocation,
expired/revoked sessions, near-expiry lifetime caps and rollback of a failed
rotation. They reuse the existing Session model; I05 needs no schema migration.
Logout tests check idempotent revocation, isolation between sessions, expired and
unknown credentials, bearer verification, cookie removal and both refresh/logout
orderings. I06 uses the existing `revoked_at` field without a new migration.
I07 tests `/me` against live session state, including logout/refresh, invalid JWTs,
wrong session ownership, removed/expired/revoked sessions and removed users. The
endpoint only reads data and needs no new migration.
