# 10 — Development Plan

## Guiding principle

Build vertical slices that become demoable early. Do not spend weeks designing every backend layer before any real screen works.

## Phase 0 — Repository foundation

Deliverables:

- pnpm workspace.
- `apps/web`, `apps/api`, `packages/contracts`.
- TypeScript strict.
- ESLint/Prettier.
- Environment validation.
- Basic CI.
- Docker/local Postgres setup if desired.
- App shell/header/navigation.

Definition of Done:

- One command installs dependencies.
- Web/API run locally.
- CI lint/type/build passes.

## Phase 1 — Static UI with mock market data

Build first:

- Market overview.
- Trading page desktop layout.
- Trading page mobile layout.
- Ticker header.
- Empty chart placeholder.
- Static order book.
- Static recent trades.
- Static order form.

Purpose:

- Validate UX/layout before realtime complexity.
- Establish reusable UI primitives.

Definition of Done:

- Responsive UI looks production-like with mock data.
- No backend dependency needed for visual review.

## Phase 2 — Historical market data + chart

Implement:

- Supported market configuration.
- Market REST endpoint/bootstrap.
- Historical candles endpoint.
- Lightweight Charts integration.
- Timeframe switch.
- Chart loading/error/resize.

Definition of Done:

- `/trade/BTC-USD` displays real historical chart data.
- Unsupported symbol is handled.

## Phase 3 — Realtime pipeline

Backend:

- Coinbase/provider adapter.
- Provider reconnect/heartbeat.
- Normalization.
- Latest market cache.
- NestJS WebSocket gateway.
- Client subscription registry.

Frontend:

- Realtime client singleton/service.
- Connection store.
- subscription manager.
- Ticker store.
- order-book model.
- recent-trade buffer.
- candle updates.
- stale/reconnect UI.

Definition of Done:

- Price, chart, order book and recent trades update live.
- Switching symbols does not leak duplicate subscriptions.
- Disconnect/reconnect demo works.

## Phase 4 — Authentication and account bootstrap

Backend:

- User/session schema.
- Register/login/refresh/logout/me.
- Password hashing.
- Secure cookie configuration.
- Atomic USD 10,000 initialization.

Frontend:

- Login page.
- Register page.
- Auth bootstrap.
- Protected routes.
- Auth-required order action.

Definition of Done:

- New user gets virtual funding exactly once.
- Auth survives reload.
- Logout clears private cache/session.

## Phase 5 — Market orders and portfolio

Backend:

- Wallet schema/service.
- Position schema/service.
- Market BUY/SELL transaction logic.
- Trade records.
- Portfolio endpoint.

Frontend:

- Market order form.
- Balance preview.
- Error mapping.
- Portfolio page.
- Live valuation/P&L from current ticker.

Tests:

- Insufficient balance.
- Buy calculation.
- Sell calculation.
- Weighted-average cost.
- Realized P&L.

Definition of Done:

- User can buy/sell virtual assets and see persistent portfolio changes.

## Phase 6 — Limit orders

Backend:

- Reserve/release locked balances.
- Pending order creation.
- Pending order evaluator consuming market data.
- Fill transaction.
- Cancellation transaction.
- Double-fill/concurrency safety.

Frontend:

- Market/Limit tabs.
- Limit-price input.
- Open orders view.
- Cancel flow.
- Locked balance display.

Definition of Done:

- Limit BUY and SELL can be created, cancelled and automatically filled under documented rules.

## Phase 7 — Orders + Watchlist completeness

Implement:

- Orders list/history.
- Filters.
- Pagination.
- Watchlist persistence.
- Market/watchlist star action.
- Watchlist page.

Definition of Done:

- All MVP business screens complete.

## Phase 8 — Quality and portfolio polish

Implement:

- Unit/component tests.
- API integration tests.
- Playwright E2E.
- Accessibility pass.
- React Profiler performance investigation.
- Measure/document one realtime optimization.
- Error monitoring.
- Structured logs.
- Production deployment.
- README screenshots/demo instructions.

Definition of Done:

- CI green.
- E2E critical flow green.
- Production app recoverable after realtime disconnect.
- Recruiter can use demo without special setup.

## Recommended build order inside one screen

For every screen:

1. Static semantic layout.
2. Responsive behavior.
3. Mock data states.
4. REST integration.
5. Realtime integration if applicable.
6. Validation/errors.
7. Tests.
8. Performance review.
9. Accessibility review.

## Scope gate before P2 features

Do not start price alerts, technical indicators, theme system or advanced order types until:

- All P0 requirements are complete.
- E2E test passes.
- Production deployment is stable.
