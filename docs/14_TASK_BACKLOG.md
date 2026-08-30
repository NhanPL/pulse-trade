# 14 — Task Backlog

This backlog is intentionally issue-oriented so tasks can be copied into GitHub Issues/CodeX prompts.

## Epic A — Repository foundation

- [x] A01 Initialize pnpm workspace.
- [x] A02 Create Next.js web app with TypeScript strict.
- [x] A03 Create NestJS API app.
- [x] A04 Create shared contracts package.
- [x] A05 Configure ESLint/Prettier.
- [x] A06 Add environment validation.
- [x] A07 Add base GitHub Actions CI.
- [x] A08 Add root development scripts.

## Epic B — Design system and app shell

- [x] B01 Define color/spacing/type tokens.
- [x] B02 Build Button/Input/Badge/Skeleton/Tabs primitives.
- [x] B03 Build desktop header/navigation.
- [x] B04 Build mobile navigation.
- [x] B05 Build responsive page container/grid utilities.
- [x] B06 Build EmptyState/ErrorState.

## Epic C — Market overview

- [x] C01 Create supported market configuration.
- [x] C02 Build market table mock UI.
- [x] C03 Add search.
- [x] C04 Add sorting.
- [x] C05 Build market row live-price component boundary.
- [x] C06 Add loading/empty/error states.
- [x] C07 Add responsive mobile market cards/table adaptation.

## Epic D — Trading screen static UI

- [x] D01 Build trading route and symbol validation.
- [x] D02 Build market header/ticker layout.
- [x] D03 Build ChartPanel shell.
- [x] D04 Build OrderBook static UI.
- [x] D05 Build RecentTrades static UI.
- [x] D06 Build OrderForm static UI.
- [x] D07 Build desktop trading grid.
- [x] D08 Build mobile tab/stack layout.

## Epic E — Market data backend

- [x] E01 Define MarketDataProvider interface.
- [x] E02 Implement Coinbase provider connection.
- [x] E03 Implement provider heartbeat.
- [x] E04 Implement provider reconnect.
- [x] E05 Normalize ticker messages.
- [x] E06 Normalize candles.
- [x] E07 Normalize order-book snapshot/deltas.
- [x] E08 Normalize recent trades.
- [x] E09 Implement latest market cache.
- [x] E10 Implement historical candles endpoint.

## Epic F — Application WebSocket

- [ ] F01 Define shared realtime schemas.
- [ ] F02 Implement NestJS realtime gateway.
- [ ] F03 Implement client subscribe command.
- [ ] F04 Implement unsubscribe command.
- [ ] F05 Implement subscription registry.
- [ ] F06 Broadcast normalized events.
- [ ] F07 Implement stale/live notifications.
- [ ] F08 Add gateway tests.

## Epic G — Frontend realtime client

- [ ] G01 Implement RealtimeClient connection lifecycle.
- [ ] G02 Implement exponential reconnect/backoff.
- [ ] G03 Implement subscription manager.
- [ ] G04 Re-subscribe after reconnect.
- [ ] G05 Implement event-router validation.
- [ ] G06 Build connection-state store.
- [ ] G07 Build ticker store.
- [ ] G08 Build order-book model/store.
- [ ] G09 Build bounded recent-trades store.
- [ ] G10 Integrate trading-page subscription hook.
- [ ] G11 Verify no listener leak on repeated route changes.

## Epic H — Chart

- [ ] H01 Integrate Lightweight Charts client component.
- [ ] H02 Load historical candles.
- [ ] H03 Add 1m/5m/15m/1h interval switch.
- [ ] H04 Apply realtime current candle update.
- [ ] H05 Add ResizeObserver behavior.
- [ ] H06 Add chart loading/error/retry.
- [ ] H07 Add chart integration tests where practical.

## Epic I — Authentication

- [ ] I01 Add users/session DB models.
- [ ] I02 Implement password hashing.
- [ ] I03 Implement register transaction + USD funding.
- [ ] I04 Implement login.
- [ ] I05 Implement refresh/session rotation.
- [ ] I06 Implement logout.
- [ ] I07 Implement `/me`.
- [ ] I08 Build register page.
- [ ] I09 Build login page.
- [ ] I10 Implement frontend auth bootstrap/protected routes.
- [ ] I11 Clear private query cache on logout.

## Epic J — Market orders

- [ ] J01 Add wallet/position/order/trade DB models.
- [ ] J02 Implement decimal/domain helpers.
- [ ] J03 Implement market BUY transaction.
- [ ] J04 Implement market SELL transaction.
- [ ] J05 Reject stale market execution.
- [ ] J06 Add order API.
- [ ] J07 Integrate OrderForm MARKET mode.
- [ ] J08 Add insufficient-balance UX.
- [ ] J09 Add transaction/concurrency tests.

## Epic K — Portfolio

- [ ] K01 Implement portfolio endpoint.
- [ ] K02 Build summary cards.
- [ ] K03 Build balances section.
- [ ] K04 Build holdings table/cards.
- [ ] K05 Combine position snapshot with live tickers.
- [ ] K06 Display unrealized P&L live.
- [ ] K07 Display realized P&L.
- [ ] K08 Add empty/loading/stale valuation states.

## Epic L — Limit orders

- [ ] L01 Implement limit BUY reservation.
- [ ] L02 Implement limit SELL reservation.
- [ ] L03 Implement pending-order evaluator.
- [ ] L04 Implement atomic fill.
- [ ] L05 Implement cancellation/release.
- [ ] L06 Prevent double fill.
- [ ] L07 Add Market/Limit form tabs.
- [ ] L08 Add limit-price field and validation.
- [ ] L09 Show available/locked balance preview.
- [ ] L10 Add full limit-order integration tests.

## Epic M — Orders page

- [ ] M01 Implement paginated orders endpoint.
- [ ] M02 Build open-orders table.
- [ ] M03 Build history table.
- [ ] M04 Add filters.
- [ ] M05 Add cancel action confirmation.
- [ ] M06 Handle cancellation race/conflict gracefully.
- [ ] M07 Responsive mobile order cards.

## Epic N — Watchlist

- [ ] N01 Add DB model/API.
- [ ] N02 Add/remove star on market UI.
- [ ] N03 Build watchlist page.
- [ ] N04 Persist after reload.
- [ ] N05 Add empty state.

## Epic O — Testing and quality

- [ ] O01 Configure Vitest/RTL.
- [ ] O02 Configure backend integration test database.
- [ ] O03 Configure Playwright.
- [ ] O04 Add critical E2E registration + market BUY.
- [ ] O05 Add limit cancel E2E.
- [ ] O06 Add watchlist E2E.
- [ ] O07 Add mocked realtime provider for deterministic CI.
- [ ] O08 Accessibility review.

## Epic P — Performance/observability/deployment

- [ ] P01 Profile ticker re-render behavior.
- [ ] P02 Optimize order-book presentation cadence.
- [ ] P03 Verify bounded trade memory.
- [ ] P04 Add frontend error reporting.
- [ ] P05 Add structured backend logs.
- [ ] P06 Add health endpoint.
- [ ] P07 Deploy PostgreSQL.
- [ ] P08 Deploy API with WebSocket support.
- [ ] P09 Deploy web.
- [ ] P10 Configure production CORS/cookies.
- [ ] P11 Run production E2E/smoke test.
- [ ] P12 Add portfolio README screenshots, architecture diagram and engineering notes.
