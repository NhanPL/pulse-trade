# Identity database models

I01 introduces only `User` and `Session`, mapped to PostgreSQL `users` and
`sessions`. See `docs/05_DATABASE_DESIGN.md` for the domain specification.

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
  credentials. Hashing and authentication endpoints are subsequent Epic I tasks.
- Each refresh credential hash is unique; a user can own multiple sessions.
- Expiry is required. Revocation and last-use timestamps are nullable until those
  events occur. The `(user_id, expires_at)` index supports user-session queries.
- Deleting a user cascades to its sessions so no orphan credentials remain.
- Timestamps use `timestamptz(3)`. Prisma maintains `updated_at` on user updates;
  raw SQL callers must update that field themselves.

The client uses CommonJS output to match the API. A runtime PostgreSQL adapter
and Nest database service will be needed when authentication starts querying
these models; I01 does not connect the public market-data API to a database.
