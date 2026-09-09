# Identity and registration database models

I01 introduces only `User` and `Session`, mapped to PostgreSQL `users` and
`sessions`. See `docs/05_DATABASE_DESIGN.md` for the domain specification.

I03 adds `WalletBalance` as the direct prerequisite for registration funding.
Other J01 models remain unimplemented. The wallet uses `NUMERIC(38,18)`, a unique
`(user_id, asset)` key and migration-level nonnegative/finite CHECK constraints.

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
and disconnected on module shutdown. Set `DATABASE_URL` in the API process
environment at runtime (the Prisma CLI separately loads `apps/api/.env`). Without
a database, public market data remains usable and registration returns 503.

## Registration integration tests

Use an isolated PostgreSQL database whose name ends in `_test`, supply its
`DATABASE_URL` in the process environment and run:

```sh
pnpm --filter @pulse-trade/api db:deploy
pnpm --filter @pulse-trade/api test:integration
```

Tests fail rather than skip when a test database is unavailable. They exercise
the HTTP endpoint, concurrent duplicate registration, exactly-once funding and
rollback after a real database CHECK violation. Cleanup targets only the test's
randomly generated emails. CI provisions PostgreSQL 16 and runs this suite.
