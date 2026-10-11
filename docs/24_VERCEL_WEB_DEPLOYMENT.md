# P09 — Vercel web deployment

## Status and scope

Deployment preparation is on `feat/p09-vercel-web`. **P09 remains unchecked:**
Vercel is not connected. The owner provided the API hostname
`pulse-trade-rhp4.onrender.com`; it is recorded below, but no hosted web deployment
or public browser verification is claimed.
Update this status only after recording the deployed commit, project and HTTPS URL.

P09 deploys the existing Next.js application. It does not move NestJS into Vercel
Functions, deploy/migrate PostgreSQL, change production CORS/cookies (P10), or run
the production registration/trading E2E flow (P11). The P08 API and P07 database
remain separate services. There are no new frontend features or visual changes.

## Project and build settings

Use one Vercel project for `NhanPL/pulse-trade`, with the Next.js framework preset.
Vercel Hobby is appropriate only for a personal, non-commercial portfolio within
its current quotas. Do not upgrade plans, purchase a domain or enable paid add-ons
without the owner's approval. Prefer the assigned HTTPS `vercel.app` domain for
the initial web-only deployment; this does not resolve cross-site authentication.

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` |
| Include source files outside Root Directory in the Build Step | Enabled; contracts and the root pnpm workspace must be available. |
| Framework Preset | Next.js |
| Node.js Version | `24.x`, also specified by `apps/web/package.json`, matching CI. |
| Install Command | From `apps/web/vercel.json`; pinned pnpm, frozen lockfile, filtered web + contracts install including dev dependencies. |
| Build Command | From `apps/web/vercel.json`; repository-root `build:web`. |
| Output Directory | Leave the Next.js default; do not override to `public`, `out` or the workspace root. |

Root Directory and outside-root access are Vercel **project settings**, not
properties to invent in `vercel.json`. The file belongs in `apps/web`, the selected
project root. Its commands move to the repository root so the shared lockfile and
workspace package graph are retained. The filtered install includes only the web
app and its workspace dependencies; it does not need API/Prisma build secrets.

`pnpm build:web` builds contracts' ESM/CommonJS outputs before `next build`. It
does not build the API, run migrations, seed users or allocate virtual balances.
Keep native Next.js routing, SSR and dynamic `/trade/[symbol]` support; do not add
SPA fallback rewrites, static export or a WebSocket proxy on Vercel Functions.

The hosted Build Command explicitly sets `VERCEL=1` so the endpoint guard cannot
silently fall back to localhost if system variables are disabled in the dashboard.
It also disables Next.js build telemetry. Local `.vercel/` project links, pulled
environment files and build outputs are ignored by Git, ESLint and Prettier.

## Public environment configuration

Set these **before building**, separately for the deployment's Production or
Preview target. The endpoint hostname below was provided by the owner; update both
values and rebuild if the API is moved to another host.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://pulse-trade-rhp4.onrender.com/api/v1` |
| `NEXT_PUBLIC_WS_URL` | `wss://pulse-trade-rhp4.onrender.com/realtime` |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional public ingestion DSN only; leave absent/empty to disable reporting. |
| `NEXT_PUBLIC_APP_RELEASE` | Optional short commit/build identifier, matching the existing P04 schema. |

Both endpoint values must be explicit, non-local and use HTTPS/WSS. Use the API
prefix and gateway path shown above, without a trailing slash, embedded user info,
query or fragment. `next.config.ts` rejects bad/missing hosted endpoints before
producing a deployment. Errors report field names/rules, not supplied values.
This validation does not resolve DNS or prove the backend is live; verify that
separately against the actual service.

`NEXT_PUBLIC_*` values are inlined into browser JavaScript. Changing them requires
a **new build/deployment**; changing runtime environment values or promoting an
old preview bundle does not replace the API/WS URLs. Rebuild for the intended
environment instead of promoting a bundle with the wrong backend.

Never add `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `JWT_ACCESS_SECRET`, passwords,
refresh tokens or service API keys to this web project or public variables. Do
not upload `.env`, root `.env.local`, `.neon` or local credential files. Keep P04
reporting opt-in; P09 does not enable a real collector or upload source maps.

## Deploy when access is available

1. Install/connect Vercel in ChatGPT, authorize the intended account/project and
   repository, and provide only the public Render API URL. Do not paste credentials
   into chat. If using the dashboard instead, import this GitHub repository.
2. Check CI for the chosen commit. Apply the project settings above and configure
   the public endpoint variables in the intended deployment target.
3. Select the reviewed P09 commit/branch for the deployment. A feature branch
   normally creates a Preview rather than replacing Production; deliberately
   choose the intended target. Do not change the repository's default branch or
   merge automatically. Confirm any existing production project before replacing it.
4. Deploy using the Git integration or connected Vercel tool. If using Vercel CLI,
   link/run it **from the repository root**, with project Root Directory already
   set to `apps/web`; do not upload a copied app missing `packages/contracts`.
5. Record the project, deployment target, URL and exact source commit. Verify the
   web-only checks below before checking off P09. A passing local build is not a
   deployed application.

## Verification

Local quality checks:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @pulse-trade/web test
pnpm build:web
pnpm --filter @pulse-trade/web test:e2e
```

The new unit tests cover required hosted URLs, secure protocols, paths, loopback
rejection, safe errors, the actual Next configuration guard and the Vercel
workspace build/install contract. Local production/E2E builds must still accept
their own HTTP/WS fixtures: HTTPS enforcement is tied to the hosted build marker,
not every `NODE_ENV=production` process. Browser URL reads remain static
`process.env.NEXT_PUBLIC_*` accesses so Next.js can inline them correctly.

Local evidence (2026-10-11): workspace lint/typecheck/format checks passed; 110
legacy frontend tests and all 100 Vitest tests passed, including 39 new P09 tests.
An initial Sentry-test import exceeded its existing 5-second timeout locally;
both a bounded-worker rerun and a fresh default-runner suite passed without
changing assertions or timeouts. All 145 existing local Chromium E2E tests passed,
including desktop/mobile, keyboard, loading/error and reconnect cases. Desktop
trading and mobile login screenshots were inspected; no UI changes were needed.

The exact filtered/pinned install succeeded without a lockfile change. A real
`next build` with `VERCEL=1` and missing endpoints failed at configuration loading
as intended. `pnpm build:web` with that marker and synthetic HTTPS/WSS endpoints
passed, and both values were found in client chunks. These synthetic hosts were
used only to verify compilation/inlining, not to deploy or contact production.
No PostgreSQL integration or authenticated production E2E was run locally for P09;
API, database and trading logic are unchanged. Hosted verification remains pending.

After the owner supplied the Render hostname, a hosted-mode local build using
the actual endpoint URLs also passed; both URLs were confirmed in client chunks.
Read-only API checks (2026-10-11) returned HTTPS health 200 with `status: ok` and
runtime-valid WSS `connection.ready`, subscription acknowledgement, BTC ticker,
book snapshot, trades and 1m candle events. The contract-validated probe received
an unsubscribe acknowledgement and closed the socket. These server-side probes
sent no authentication credentials or account/order mutations and do not prove
browser CORS, session-cookie behavior or a hosted web deployment.

Against the **actual deployment**, verify:

- HTTPS certificate and successful page/asset responses; no mixed content,
  hydration errors, missing chunks or requests to the browser's localhost.
- Direct load **and reload** of `/`, `/trade/BTC-USD`, `/login`, `/register`.
  Signed-out `/portfolio`, `/orders`, `/watchlist` retain the existing login guard
  and safe return-to route. Check desktop and small mobile plus keyboard access.
- DevTools shows REST going to the selected `/api/v1` and WebSocket connecting
  directly to the selected WSS `/realtime`, not Coinbase or a Vercel Function.
  Check ticker/chart/book/trades rendering and existing reconnect/stale states.
- Build logs show only contracts + Next.js being built with the intended Node/pnpm
  versions. Record the CI result and deployed commit, without copying secrets.

P08's Render Free idle suspension/cold start is a known demo constraint, not a
reason to add polling or artificial keep-alive traffic. Backend outages must
retain the existing loading/error/reconnecting behavior.

Cross-origin market REST/WS may be blocked until the exact web origin is reviewed
under **P10**. Host-only Secure SameSite=Lax refresh cookies do not support arbitrary
cross-site `vercel.app`/`onrender.com` login. Do not add wildcard CORS, loosen
cookies, disable CSRF checks or claim an authenticated production smoke flow
passed here. Keep the existing documented production login-protection gate.

## Recovery and follow-up

On a failed build, retain the previous deployment and correct project root,
dependency installation or public endpoint configuration, then rebuild. Never
disable validation/typechecking to force deployment. If a deployed bundle points
to the wrong API, rebuild with corrected variables; do not mutate balances or run
database migrations to troubleshoot a web hosting problem.

Before rolling back/promoting an older deployment, check which public URLs were
baked into it. P10 handles production origins/cookies; P11 owns the authenticated
production E2E/smoke test. This preparation does not mark those tasks complete.

## Provider references

- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel shared-source Root Directory setting](https://vercel.com/docs/monorepos/monorepo-faq)
- [Vercel vercel.json configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Next.js public environment variables](https://nextjs.org/docs/app/guides/environment-variables)
