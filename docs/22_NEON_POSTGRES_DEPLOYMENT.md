# P07 — PostgreSQL on Neon Free

## Scope and deployed resource

P07 deploys the existing PostgreSQL schema, not the API or frontend. Prisma and
`@prisma/adapter-pg` remain the migration/runtime boundary. No Neon Auth, Functions,
Data API, new driver, seed, trading change or provider integration is introduced.
API hosting, web hosting and production cookies/CORS remain P08–P10.

Verified on 2026-10-10 against the owner's existing **Pulse Trade** project:

- Organization plan: `free`, confirmed through the Neon API; no paid upgrade.
- Region: Singapore (`aws-ap-southeast-1`).
- Existing PostgreSQL major version: **18**, retained rather than recreated.
- Default branch: `production`; database: `neondb`; schema: `public`.
- Compute: fixed **0.25 CU**, after the owner approved reducing the original
  0.25–2 CU range. Idle suspension remains the fixed Free-plan default. The API
  reports `suspend_timeout_seconds: 0`, meaning use the plan default, not always-on.
- Restore history: **21,600 seconds (6 hours)**, confirmed in project settings.

The linked `.neon` context and root `.env.local` were reused. No second project was
created and `apps/api/.env` was not replaced. Local API development still uses its
existing database; an API deployment must explicitly receive the Neon secrets.

## Connection and secret contract

Use two URLs for the **same endpoint, database and role**:

| Variable | Consumer | Connection |
|---|---|---|
| `DATABASE_URL` | `PrismaService` / API runtime | Pooled hostname containing `-pooler` |
| `DATABASE_URL_UNPOOLED` | Prisma CLI | Direct hostname, without `-pooler` |

Neon uses PgBouncer transaction pooling. Migration sessions and backups use the
direct connection; normal runtime queries keep pooling. Prisma 7's CLI URL lives
in `prisma.config.ts`, not the old schema `directUrl` field. The direct variable is
optional for local PostgreSQL, where migrations fall back to `DATABASE_URL`.
An explicitly empty direct value does not silently select another target.

For `NODE_ENV=test`, Prisma **only** uses the guarded `DATABASE_URL`, ignoring
inherited `DATABASE_URL_UNPOOLED` and the development `.env`. This prevents a
production migration secret from redirecting O02's isolated integration runner.
Generation/validation still require no live database or credentials.

Keep `.env.local`, `.env`, `.env.test`, `.neon`, CLI credentials, passwords and
connection strings out of Git/logs. Supply secrets through a private environment
file or the future API host's secret manager, never browser `NEXT_PUBLIC_*`
variables, command-line URL arguments or committed examples. Do not run env-pull
or checkout commands that replace existing credentials without approval.

Require TLS and prefer explicit `sslmode=verify-full` (certificate and hostname
verification) for both URLs; never set `rejectUnauthorized=false`. The supplied
URLs use `sslmode=require`; the installed node-postgres version currently treats
that as `verify-full` but warns that a future major version will change this.
Use explicit `verify-full` when provisioning deployment secrets. Client-side TLS
checks confirmed encryption, a verified certificate and TLS 1.3 on both endpoints.
The backend `pg_stat_ssl` view alone is not a client-to-proxy TLS verification.

See [Neon pooling](https://neon.com/docs/connect/connection-pooling),
[secure connections](https://neon.com/docs/connect/connect-securely) and
[node-postgres SSL](https://node-postgres.com/features/ssl).

## Migration rollout

Before changing production, confirm the Console/CLI project, branch, database,
direct/pooled pair and current migration history. Stop if the target is unexpected,
contains an incompatible schema, or reports failed/checksum-mismatched migrations.
Never repair that by resetting production or editing applied migration files.

1. Create an expiring child branch of `production` with fixed 0.25 CU. Use explicit
   project/branch arguments, `--no-secrets --no-analytics` and the plan-default sleep
   setting; do not switch the local context or pull over existing env files.
2. On that branch only, create a dedicated database ending `_test`. Supply its
   direct URL through `TEST_DATABASE_URL` and run the existing O02 guarded setup.
   Tests must never target the production DB or the child's copied application DB.
3. Check migrations and financial/auth integration behavior there before rollout.
4. On production, use **`prisma migrate deploy`** only. Do not use `migrate dev`,
   `db push`, `migrate reset`, schema imports or test fixture creation.
5. Repeat deploy to confirm no pending migrations, then run migration status and
   read-only runtime/schema checks. Do not seed accounts or virtual funds.

With private variables already supplied to the API command environment:

```bash
pnpm --filter @pulse-trade/api db:deploy
pnpm --filter @pulse-trade/api db:status
```

For this workspace's already linked Neon `.env.local`, run from the repository
root with Node 24 (ensure the shell is not in `NODE_ENV=test` and has no conflicting
database overrides). This reads that file without rewriting the local API `.env`:

```bash
node --env-file=.env.local apps/api/node_modules/prisma/build/index.js migrate deploy --config apps/api/prisma.config.ts
node --env-file=.env.local apps/api/node_modules/prisma/build/index.js migrate status --config apps/api/prisma.config.ts
```

No migration is automatically executed during API startup or ordinary builds.
The four checked-in migrations create seven application tables, three order enums,
financial `NUMERIC(38,18)` columns, ownership/uniqueness constraints, financial check
constraints and indexes. Registration, not deployment, allocates each account's
single $10,000 virtual USD balance. The DB design remains [05_DATABASE_DESIGN.md](05_DATABASE_DESIGN.md).

## Cloud integration validation

The temporary normal branch `p07-migration-validation` was created from the empty
production branch with expiry `2026-10-11T12:00:00Z`; tests used its separate
`pulse_trade_test` DB. No production data or account was used for test mutations.
After successful validation, that branch and its disposable test DB were deleted
on 2026-10-10. No independent backup of the test fixtures was retained; the suites
can recreate them. Production and local env/context remained unchanged by cleanup.

Neon-generated test URLs may include `channel_binding=require`. O02 deliberately
accepts only `schema=public` and `sslmode`; remove that parameter **only from the
isolated test URL**, keep `sslmode=verify-full`, and do not weaken the target guard.
Never echo the resulting URL. For a small cloud compute, compile the API and prepare
through O02 first, then run each file sequentially using the same guarded child env:

```bash
pnpm --filter @pulse-trade/api build
pnpm --filter @pulse-trade/api db:test:prepare
```

From the repository root, with the isolated `TEST_DATABASE_URL` already supplied:

```js
// Run with node --input-type=module; no URL goes in arguments or output.
import { spawnSync } from 'node:child_process';
import { resolveIntegrationEnvironment } from './apps/api/scripts/integration-test-database.mjs';
const env = resolveIntegrationEnvironment(process.env);
const result = spawnSync(process.execPath,
  ['--test', '--test-concurrency=1', 'test/integration/*.test.mjs'],
  { cwd: 'apps/api', env, stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
```

Only file-level scheduling changes; concurrent financial requests, cancellation
races and double-fill checks within those files still execute concurrently.
Default parallel cloud execution failed 7/77 tests with serialization conflicts
and cascading assertions. Sequential execution passed **77/77**. No assertion,
transaction isolation, retry policy or normal CI scheduling was weakened to hide
that result; the Free compute is not a load-test environment.

## Free-plan limits and recovery

At verification, the Free plan provides **1 GB storage per project**, **100 CU-hours
per project/month**, 10 branches and a 6-hour restore window. At a steady 0.25 CU,
100 CU-hours is about **400 active hours**, not an entire month of always-on use.
Test branches share the project's allowance. Re-check the current
[Free-plan announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project) and
[pricing](https://neon.com/pricing) before relying on these dated limits.

The current pending-limit evaluator queries PostgreSQL as live tickers arrive.
An always-running API/feed can therefore keep compute active even without users.
Do not promise a free 24/7 demo or disable limit-order evaluation to save quota.
API hosting/cost choices and any evaluator optimization are separate follow-ups.
Monitor compute/storage/transfer in the Console and clean up disposable test
branches; retain the mandatory Free-plan
[scale-to-zero policy](https://neon.com/docs/introduction/scale-to-zero).

The confirmed 6-hour [restore history](https://neon.com/docs/introduction/branch-restore)
is recovery capability, not an independent long-retention backup. Before future
risky migrations or important demo data, take an encrypted logical backup with a
PostgreSQL 18-compatible `pg_dump` over the **direct** connection, supplying
credentials privately via environment/.pgpass. Keep dumps out of the repository
and test restore on an isolated branch. For an incident, preserve the current
branch, restore to a new branch within the available history, validate it, then
explicitly approve a connection-secret switch. Do not reset the production branch.

## Verification evidence

- Production deployment applied all four migrations; repeated deploy was a no-op
  and `migrate status` reported up to date.
- Existing `PrismaService` successfully queried through the pooled endpoint.
- Read-only checks matched migration names/checksums, all seven tables, 28 named
  validated constraints, 13 explicit indexes, three enum definitions and all 13
  financial columns at precision 38 / scale 18.
- All application tables remained empty after migration; no funding/seed occurred.
- Eight new config regression tests cover direct/runtime separation, local fallback,
  env precedence, missing/empty values and production-secret isolation in tests.
- Format, lint, workspace typecheck/build and **193/193 backend tests** passed.
  Cloud integration: **77/77** with the file-level scheduling described above.

This proves PostgreSQL deployment and compatibility, not a live public API/web
deployment. P06 process health still does not assert database readiness. The
existing CI continues to use its own PostgreSQL service and needs no Neon secrets.
