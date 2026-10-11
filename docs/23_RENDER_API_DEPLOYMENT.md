# P08 — Render API deployment

## Status and scope

Deployment preparation is implemented on `feat/p08-render-api`. The owner accepted
Render Free's idle/cold-start limitations. **P08 remains unchecked:** Render is not
connected, no service has been created, and public HTTPS/WSS has not been verified.
This document must not be treated as evidence of a successful hosted deployment.

P08 only hosts the existing NestJS API. It does not deploy Next.js (P09), redesign
production CORS/cookies (P10), or perform the production trading E2E flow (P11).
The existing Neon database and migrations from P07 are retained unchanged.

## Runtime and build

The repository-root [render.yaml](../render.yaml) defines one native Node web
service in Singapore, near the existing Neon database:

- Free compute; one API process, no additional worker or database service.
- Node 24, matching the CI major version; pnpm explicitly pinned to the repository's
  `packageManager` version, `11.24.0`, via `npx`.
- Root workspace build; do **not** set the service root directory to `apps/api`.
  The API needs `packages/contracts`, the workspace manifest and root lockfile.
- Frozen-lockfile install with development dependencies included for TypeScript,
  Nest CLI and Prisma generation. Native builds remain allowed by the existing
  `pnpm-workspace.yaml`, including Argon2.
- `pnpm build:api` builds contracts (ESM and CommonJS) before Prisma generation and
  the API. It does not build the web app or mutate the database.
- `cd apps/api && exec node dist/main.js` starts compiled code, not a dev watcher.
  `exec` lets Node receive platform shutdown signals directly.
- HTTP and `/realtime` share Render's `PORT`, bound explicitly to `0.0.0.0`.
  Render terminates TLS; clients use `https://<service-host>/api/v1` and
  `wss://<service-host>/realtime`. There is no separate WebSocket port.
- `/api/v1/health` is the public, dependency-independent liveness probe from P06.
  A 200 response is **not** proof that PostgreSQL or Coinbase is usable.
- Automatic redeploys wait for passing linked-branch CI checks. Validate the
  initial Blueprint deployment's commit manually; the initial creation is not a
  substitute for CI review.

The existing Nest shutdown hooks stop the provider, evaluator and freshness timers.
The existing `WsAdapter` closes active upgraded sockets; clients reconnect and
re-subscribe using the existing frontend lifecycle. No new socket ownership,
protocol or heartbeat policy is introduced. Render's shutdown grace is 30 seconds.

## Private configuration

The Blueprint requires these values outside Git:

| Variable | Source and purpose |
| --- | --- |
| `DATABASE_URL` | P07's pooled Neon production URL, with verified TLS. Supply in Render secrets, never paste into chat/logs. |
| `JWT_ACCESS_SECRET` | Render generates a random secret on initial creation. Retain it across restarts; rotation invalidates existing access tokens. |
| `WEB_ORIGIN` | One explicitly chosen web origin, without route paths; required rather than a wildcard. Web hosting is still pending. |

Render supplies `PORT`; the Blueprint sets `NODE_ENV=production` and `NODE_VERSION=24`.
Do not upload local `.env` files, `.env.local`, `.neon`, test database credentials,
or the direct `DATABASE_URL_UNPOOLED` migration secret to the runtime service.
Do not run migrations, seeds or balance funding in the build/start command.

The existing refresh cookie is host-only, Secure in production, and SameSite=Lax.
Do not loosen it to make unrelated `onrender.com`/web-provider domains work.
Browser login across sites needs the separately reviewed P10 design. CORS is not
access control: the API remains publicly reachable by non-browser clients.

The project's existing requirement for production **login rate limiting** must be
met before public deployment. Render's DDoS protection is not a credential-stuffing
or login-attempt limiter. An appropriate edge policy must also cover direct API
access; merely adding a proxy while leaving the original host unprotected is not
sufficient. No login limiter is claimed to exist in this task's preparation.

## Deploy when the connection is available

1. Connect Render to ChatGPT and authorize access to `NhanPL/pulse-trade`. Do not
   send API keys or passwords through chat. Select the intended workspace.
2. Confirm the branch's CI passes, choose the allowed `WEB_ORIGIN`, and satisfy the
   authentication protection requirement above before creating public resources.
3. Create a Blueprint from this repository and `feat/p08-render-api`, using the
   root `render.yaml`. Confirm Free compute and Singapore. The Blueprint uses its
   selected branch; no feature branch is hard-coded in the file.
4. Supply private environment values using the connected service's secret controls.
   Check the actual build and startup logs without exporting credentials or raw
   request bodies. Confirm `application.ready` and a successful health probe.
5. Record the resulting service hostname and deployed commit, then perform the
   checks below. Do not check off P08 on build success alone.

## Verification

Local commands:

```sh
pnpm build:api
pnpm --filter @pulse-trade/api exec node --test test/deployment.test.mjs
pnpm --filter @pulse-trade/api test
pnpm lint
pnpm typecheck
pnpm format:check
```

`deployment.test.mjs` uses real Nest HTTP/WS boundaries with a normalized mock
provider, without exchange or database access. It verifies:

- Health and all four realtime channels on one listening port.
- Runtime-validated envelopes, command acknowledgements, subscription release,
  and a fresh connection with re-subscription.
- `app.close()` with an active socket, without the fixture forcibly destroying it;
  provider listeners and subscription references are released.
- The built CommonJS contracts, generated Prisma client and native Argon2 module.

This does not prove Linux native-module compatibility, platform TLS/proxy behavior,
OS-signal delivery or live provider access. CI and hosted checks supply that evidence.
No browser layout has changed.

Local evidence (2026-10-10): `pnpm build:api`, workspace typecheck, lint and format
checks passed. All 196 API tests passed, including the three deployment tests.
No PostgreSQL integration or production E2E run was performed for this preparation;
financial/database behavior is unchanged. Linux CI and public Render verification
remain separate gates.

Before completing P08, verify and record against the **actual Render hostname**:

1. HTTPS `GET /api/v1/health` returns 200 and `{ "data": { "status": "ok" } }`;
   certificates validate, and HTTP redirects to HTTPS.
2. WSS `/realtime` returns `connection.ready`, accepts a valid `subscribe` command,
   and delivers runtime-valid BTC ticker, book, trade and 1m candle events. Then
   unsubscribe, confirm acknowledgement, and close the connection.
3. Establish a new connection and re-subscribe; deploy/restart also causes the
   existing frontend client to reconnect without duplicate subscriptions.
4. Check a read-only Prisma query through the pooled runtime connection. Do not
   register test users or place orders in production for P08.
5. Check shutdown/startup and logs; last-known market data must not be falsely
   advertised as fresh during provider reconnect or a cold start.

## Free-plan limits and recovery

Render Free spins down after 15 minutes without inbound HTTP traffic or inbound
WebSocket messages; a new request/connection can take about a minute to wake it.
This is an owner-accepted demo compromise, not a guarantee of always-on realtime.
Do not add artificial traffic or polling to evade idle suspension.

The workspace's Free instance-hour allowance is shared across services. Usage
limits, bandwidth/build allowances and unusually high service-initiated traffic
can suspend service or incur charges if billing is enabled. Do not add paid
resources or assume an unlimited free tier. Monitor usage before promising uptime.

While the API is running, the existing pending-limit evaluator receives market
ticks and can query Neon even without browser clients. Keeping the process awake
can consume Neon Free compute quota; do not disable order evaluation to save quota.
When Render sleeps, pending orders cannot fill until the process and fresh feed
resume. Persistent orders/balances stay in Neon; market caches are in memory and
rebuild after restart. The service's filesystem is ephemeral.

For an application-only rollback, manually deploy the last verified API commit.
Do not reset the database or run reverse migrations as part of an API rollback.
Database recovery follows the limited Neon restore window documented in P07.

## Provider references

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Node version selection](https://render.com/docs/node-version)
- [WebSocket hosting and shutdown](https://render.com/docs/websocket)
- [Health checks](https://render.com/docs/health-checks)
- [Free service limitations](https://render.com/docs/free)
- [DDoS protection and application-level security](https://render.com/articles/how-render-handles-ddos-attacks)
