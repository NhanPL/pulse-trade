# 00 — Project Overview

## 1. Product name

Working name: **PulseTrade**.

The name is intentionally replaceable; the architecture must not depend on branding.

## 2. Product statement

PulseTrade is a web application that allows a user to:

- Explore a curated crypto market list.
- Observe live market prices.
- Inspect a financial candlestick chart.
- Inspect Level-2 order-book updates.
- Observe recent market trades.
- Create a virtual account with an initial USD balance.
- Simulate market and limit BUY/SELL orders.
- Track virtual holdings and profit/loss.
- Maintain a personal watchlist.

External market data is real. Trading is simulated.

## 3. Portfolio objective

The project is designed primarily to demonstrate frontend engineering beyond CRUD. It should make the following capabilities visible during a recruiter demo:

1. React/Next.js architecture.
2. Strict TypeScript.
3. Real-time WebSocket processing.
4. High-frequency rendering optimization.
5. Financial chart integration.
6. Complex component composition.
7. Server-state vs client/stream-state separation.
8. Backend API design.
9. PostgreSQL transactional business logic.
10. Authentication/session handling.
11. Automated testing.
12. Responsive UI and accessibility.
13. Deployment and monitoring.

## 4. Target users

### Guest

Can:

- View market overview.
- Search/sort markets.
- Open a trading screen.
- View live ticker, chart, order book and recent trades.

Cannot:

- Place orders.
- View a portfolio.
- Persist a watchlist.

### Authenticated user

Can additionally:

- Receive a default virtual USD balance after registration.
- Create market orders.
- Create limit orders.
- Cancel eligible limit orders.
- View order history.
- View portfolio and P&L.
- Add/remove watchlist symbols.

No administrator role is required for MVP.

## 5. MVP market universe

Start with a small curated list, for example:

- BTC-USD
- ETH-USD
- SOL-USD
- ADA-USD
- XRP-USD

The exact provider-supported symbols can be adjusted during implementation.

Do not build dynamic exchange-wide symbol discovery in MVP.

## 6. Main user journey

1. Guest opens `/`.
2. Market prices update live.
3. Guest selects BTC-USD.
4. `/trade/BTC-USD` opens.
5. Ticker, chart, order book and recent trades update live.
6. Guest clicks BUY.
7. If unauthenticated, app asks user to sign in/register.
8. User registers and receives virtual USD 10,000.
9. User places a market BUY.
10. Portfolio holdings update.
11. Current price moves and unrealized P&L updates.
12. User creates a limit order.
13. Order stays pending until market trigger condition is met.
14. User checks `/orders` and `/portfolio`.
15. User reloads the app and persisted account data remains.

## 7. Success criteria

The project is portfolio-ready when:

- The full journey above works reliably.
- Realtime disconnect/reconnect can be demonstrated.
- Mobile layout is usable, not merely compressed desktop UI.
- No financial calculation uses unsafe floating-point assumptions for persisted values.
- Critical trading calculations are covered by tests.
- E2E tests cover the main user flow.
- CI blocks merging/building on lint/type/test failures.
- Production errors can be observed through monitoring/logs.

## 8. Scope discipline

When deciding whether to add a feature, ask:

> Does this feature demonstrate an important frontend/full-stack engineering skill that is not already demonstrated?

If not, defer it.
