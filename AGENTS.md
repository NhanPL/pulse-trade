# AGENTS.md — PulseTrade Real-time Trading Dashboard

This file defines how an AI coding agent must work on the PulseTrade repository.

PulseTrade is a portfolio-grade **real-time crypto market dashboard + paper trading application**. It uses real public market data, but all trading is simulated with virtual balances.

The agent should behave like a careful senior engineer working inside an existing product team: understand the requirement first, preserve architecture boundaries, make focused changes, test the result, and avoid unnecessary scope expansion.

---

## 1. Primary mission

Build and maintain a polished production-style application that demonstrates strong React/TypeScript frontend engineering together with a well-structured NestJS backend.

The most important engineering qualities are:

- High-frequency realtime data without unnecessary React re-renders.
- Clear separation between REST/server state and streaming state.
- Reliable WebSocket lifecycle: connect, subscribe, unsubscribe, reconnect, re-subscribe, stale detection.
- Correct order-book snapshot + delta processing.
- Safe virtual-wallet and paper-trading transactions.
- Correct market/limit order rules.
- Correct available vs locked balances.
- Correct realized/unrealized P&L.
- Responsive, accessible, polished UI.
- Strict TypeScript contracts shared across frontend/backend.
- Automated tests for important business and realtime behavior.

Do not optimize for the largest number of features. Optimize for a smaller number of well-engineered, demonstrable features.

---

## 2. Product boundaries — non-negotiable

PulseTrade is **paper trading only**.

Do not implement any of the following unless the project owner explicitly changes the product scope:

- Real-money trading.
- Bank/payment gateway integration.
- Crypto deposits or withdrawals.
- Blockchain wallets.
- MetaMask.
- KYC/AML.
- Futures.
- Margin trading.
- Leverage.
- Short selling.
- Copy trading.
- Smart contracts.
- NFT/Web3 features.
- Kafka/Kubernetes/microservices merely for architectural appearance.

Do not turn PulseTrade into a real exchange.

---

## 3. Repository architecture

Use a pnpm workspace monorepo.

```text
apps/
  web/          # Next.js frontend
  api/          # NestJS backend

packages/
  contracts/    # shared Zod schemas and TypeScript contracts

docs/           # product and engineering specifications
```

Do not introduce Turborepo unless build orchestration creates a real need.

Dependency direction should generally be:

```text
app -> features -> shared ui/lib -> contracts
```

Do not create circular dependencies.

Do not let one feature reach casually into another feature's private internals.

---

## 4. Required technology stack

### Frontend

- Next.js App Router
- React
- TypeScript with `strict: true`
- Tailwind CSS
- TanStack Query v5
- Zustand
- TradingView Lightweight Charts
- React Hook Form
- Zod
- Vitest
- React Testing Library
- Playwright for E2E

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Standard WebSocket semantics using `ws` with NestJS gateway/adapter
- Zod/shared contracts where appropriate
- Supertest/backend integration testing

### Market-data provider

Initial provider:

- Coinbase public market data

Provider-specific payloads must be isolated behind a market-data adapter/interface.

Frontend must **not** connect directly to Coinbase in the final architecture.

### Optional infrastructure

Redis is optional and should not block MVP.

Use it only when there is a concrete reason such as multi-instance shared realtime state, pub/sub, or shared cache needs.

---

## 5. Documentation is the source of truth

Before implementing a task, read the relevant documentation in `docs/`.

Important files:

```text
docs/00_PROJECT_OVERVIEW.md
docs/01_PRODUCT_REQUIREMENTS.md
docs/02_TECH_STACK.md
docs/03_SYSTEM_ARCHITECTURE.md
docs/04_DOMAIN_BUSINESS_RULES.md
docs/05_DATABASE_DESIGN.md
docs/06_API_DESIGN.md
docs/07_WEBSOCKET_SPEC.md
docs/08_FRONTEND_ARCHITECTURE.md
docs/09_FOLDER_STRUCTURE.md
docs/10_DEVELOPMENT_PLAN.md
docs/11_TESTING_QUALITY_PERFORMANCE.md
docs/12_SECURITY_DEPLOYMENT.md
docs/13_CODING_CONVENTIONS.md
docs/14_TASK_BACKLOG.md
docs/screens/*
```

Do not read every file blindly for every task.

Read the smallest relevant set.

Examples:

- Market UI task -> overview + screen spec + frontend architecture.
- WebSocket task -> system architecture + WebSocket spec + frontend/backend realtime sections.
- Order task -> business rules + database + API + orders screen.
- Portfolio task -> business rules + portfolio screen + API.

If implementation and documentation conflict, do not silently guess. Prefer the current written product requirement and clearly note the conflict.

---

## 6. MVP routes

Public:

```text
/
/trade/[symbol]
/login
/register
```

Authenticated:

```text
/portfolio
/orders
/watchlist
```

Trading market data is public.

Placing an order requires authentication.

---

## 7. Screen responsibilities

### `/` — Market Overview

Must include:

- Market list.
- Search.
- Sort.
- Current price.
- 24h change.
- High/low.
- Volume.
- Watchlist action.
- Realtime connection status.

A price update should not cause the entire table to rerender.

### `/trade/[symbol]` — Trading Workspace

This is the most important screen in the portfolio.

Must include:

- Market header.
- Live ticker.
- Candlestick chart.
- Timeframes: 1m / 5m / 15m / 1h.
- Order book.
- Recent trades.
- BUY/SELL order form.
- MARKET/LIMIT mode.
- Connection state.
- Responsive mobile layout.

Each high-frequency widget should have an independent render boundary.

### `/login`

Must include:

- Email.
- Password.
- Validation.
- Auth error state.
- Return-to-intended-route behavior where applicable.

### `/register`

Must include:

- Email.
- Password.
- Confirm password.
- Clear message that account receives $10,000 virtual USD.
- Exactly one initial virtual funding allocation.

### `/portfolio`

Must include:

- Total value.
- Available/locked balances.
- Holdings.
- Average cost.
- Current price.
- Market value.
- Unrealized P&L.
- Realized P&L.
- Realtime price updates.
- Stale-data indication.

### `/orders`

Must include:

- Open Orders.
- History.
- Filters.
- Status badges.
- Cancel pending limit order.
- Cancellation conflict/race handling.

### `/watchlist`

Must include:

- Persisted symbols.
- Realtime ticker updates.
- Remove action.
- Empty state.

---

## 8. Visual design rules

The product should feel like one coherent premium fintech application.

Use a consistent design language across every page:

- Dark midnight/navy background.
- Charcoal/navy elevated panels.
- Teal/cyan primary accent.
- Green for positive market/P&L values.
- Red/coral for negative market/P&L values.
- Off-white primary text.
- Muted blue-gray secondary text.
- Thin subtle panel borders.
- Moderate rounded corners.
- Restrained shadows/glows.
- Clean modern sans-serif typography.
- Dense enough for a trading app, but never cramped.

Do not create one page with a different theme or unrelated component style.

Do not rely on green/red alone to communicate meaning; always include text/sign/status.

Responsive behavior is mandatory.

Desktop and mobile should be designed intentionally rather than merely shrinking the desktop grid.

---

## 9. Frontend state architecture

Do not put all state in one place.

### TanStack Query

Use for server state:

- Current user.
- Portfolio snapshot.
- Orders.
- Watchlist.
- REST market metadata.
- Historical candles when fetched through the app API.

### Zustand

Use for high-frequency realtime/client state:

- WebSocket connection state.
- Latest tickers.
- Market freshness.
- Order-book data.
- Recent trades.
- Current realtime candle where appropriate.

Use narrow selectors.

Bad:

```ts
const tickers = useMarketStore((state) => state.tickers);
```

when the component only needs BTC price.

Prefer:

```ts
const price = useMarketStore((state) => state.tickers['BTC-USD']?.price);
```

### Local React state

Use for local UI interactions only:

- Tab selection.
- Modal open/close.
- Sort dropdown state.
- Temporary component state.

### React Hook Form

Use for auth and order forms.

### Lightweight Charts

Treat chart integration as an imperative boundary.

Keep chart/series instances in refs or an adapter hook.

Do not put thousands of candle points into React state just to drive chart rendering.

---

## 10. Realtime architecture

Frontend connects to the PulseTrade backend WebSocket gateway.

Backend connects to the market provider.

```text
Coinbase
   ↓
MarketDataProvider adapter
   ↓
Normalization layer
   ↓
PulseTrade WebSocket Gateway
   ↓
Frontend RealtimeClient
   ↓
Zustand / chart adapters
```

React components must not implement socket lifecycle logic individually.

Create a reusable realtime client layer such as:

```text
lib/realtime/
  RealtimeClient.ts
  subscription-manager.ts
  event-router.ts
```

It owns:

- Connection.
- Disconnect.
- Reconnect.
- Exponential backoff.
- Message validation.
- Subscription commands.
- Unsubscription commands.
- Re-subscription after reconnect.
- Event routing.

Every subscription/listener must have a cleanup path.

When reviewing a realtime feature always answer:

1. Who subscribes?
2. Who owns the subscription?
3. Who unsubscribes?
4. What happens after reconnect?
5. What happens when the route/symbol changes?

---

## 11. Order-book rules

Conceptual model:

```text
bids: Map<priceString, quantityString>
asks: Map<priceString, quantityString>
```

Processing:

1. Apply snapshot.
2. Apply deltas.
3. Quantity `0` removes the level.
4. Derive sorted top N rows for presentation.
5. Bids sort descending.
6. Asks sort ascending.

Do not rerender React once for every provider delta if the feed is faster than useful visual cadence.

Ingestion may happen at full rate while presentation is throttled/batched.

---

## 12. Recent-trades rules

Recent trades must be bounded.

Typical buffer:

```text
50–100 latest normalized trades
```

Never let an in-memory list grow indefinitely.

On new data:

```text
new + existing
-> deduplicate if necessary
-> newest first
-> slice to maximum length
```

---

## 13. Financial correctness

Financial values at API boundaries should normally be strings.

Database financial columns should use decimal-capable `NUMERIC` types.

Avoid floating-point arithmetic for authoritative balances, order prices, quantity, cost basis, or P&L.

Frontend estimates are previews only.

Backend calculations are authoritative.

### Initial virtual balance

Each new user gets exactly:

```text
10,000 USD virtual balance
```

Do not duplicate funding on retries or repeated registration flows.

### Available and locked balances

Limit orders reserve funds/assets.

Limit BUY:

```text
required USD = limit price × quantity
available USD decreases
locked USD increases
```

Limit SELL:

```text
available asset decreases
locked asset increases
```

Cancel releases locked balance.

Fill consumes locked balance atomically.

### Invalid operations

Reject:

- Non-positive quantity.
- Non-positive limit price.
- BUY beyond available quote balance.
- SELL beyond available base asset.
- Cancelling non-pending order.
- Duplicate/double fill.
- Execution based on market data that backend considers stale.

### Order states

Use explicit states:

```text
PENDING
FILLED
CANCELLED
REJECTED
```

Use discriminated unions or enums rather than loosely interpreted strings.

---

## 14. Transactions and concurrency

Trading mutations must be transaction-safe.

Example danger:

```text
Balance = 1000
Order A = 800
Order B = 800
```

Concurrent requests must not create a negative balance.

Critical operations should use database transactions and appropriate row-level locking/concurrency control.

Limit fill must be atomic and idempotent enough to prevent double fill.

If Prisma abstraction is insufficient for a concurrency-critical query, a small well-reviewed raw SQL section is acceptable.

Do not weaken correctness merely to avoid raw SQL.

---

## 15. Authentication/security

Recommended session model:

- Password hashed with Argon2id or bcrypt.
- Short-lived access token.
- Refresh/session credential in Secure HttpOnly cookie.
- Session or hashed refresh-token identifier stored server-side.

Do not store refresh tokens in `localStorage`.

Never trust a frontend-provided user ID as identity.

Authenticated backend routes resolve identity from verified auth context.

Do not log:

- Passwords.
- Tokens.
- Cookies.
- Sensitive credentials.

---

## 16. Shared contracts

`packages/contracts` should contain only cross-application contracts such as:

- REST request/response schemas.
- WebSocket envelopes/events/commands.
- Common error schema.
- Decimal/string validation schema.
- Shared enums when genuinely cross-app.

Do not move backend entities/services into shared contracts.

Do not move frontend view models into shared contracts.

Validate untrusted runtime payloads.

TypeScript types alone are not validation.

---

## 17. Component architecture

Generic reusable primitives belong in:

```text
components/ui/
```

Examples:

- Button
- Input
- Select
- Tabs
- Modal
- Drawer
- Badge
- Skeleton
- Tooltip
- EmptyState
- ErrorState

Domain components belong in their feature.

Bad:

```text
components/ui/OrderBook.tsx
```

Good:

```text
features/trading/components/order-book/OrderBook.tsx
```

Prefer small focused components and composition.

Do not create an 800-line `TradingPage.tsx`.

---

## 18. Error/loading/empty states

Every user-facing data feature must consider:

- Loading.
- Empty.
- REST/API error.
- Realtime disconnect.
- Reconnecting.
- Stale data.

Do not blank the entire UI during a temporary realtime reconnect.

Keep last known values visible and clearly label them as reconnecting/delayed when appropriate.

Chart errors should not break the order form.

Order-form errors should remain local to the order form.

Unexpected fatal route errors belong in an error boundary.

---

## 19. Accessibility

At minimum:

- Keyboard-accessible interactive elements.
- Correct form labels.
- Visible focus states.
- Semantic buttons and tables where applicable.
- Accessible names for icon-only controls.
- Profit/loss includes `+` or `-`, not only color.
- BUY/SELL always has visible text labels.

Do not sacrifice accessibility for trading-dashboard aesthetics.

---

## 20. Performance rules

This project is specifically intended to demonstrate realtime frontend performance.

Always consider render scope.

A BTC ticker update should not rerender:

- Entire app shell.
- Sidebar/header unrelated elements.
- Entire markets table.
- Every trading panel.

Use:

- Narrow Zustand selectors.
- `React.memo` only when justified.
- Batching/throttling for high-frequency presentation.
- Bounded buffers.
- Imperative chart update APIs.

Measure before introducing complicated optimization.

Leave a short comment explaining **why** intentional realtime throttling/batching exists.

---

## 21. Testing expectations

Do not consider an important trading feature complete without appropriate tests.

### Pure unit tests

Strong candidates:

- Weighted average cost.
- Realized P&L.
- Unrealized P&L helper logic.
- Order cost.
- Balance reservation.
- Order-book reducer/snapshot/delta behavior.
- Recent-trade buffer bounding/deduplication.

### Frontend component tests

Examples:

- OrderForm validation.
- Insufficient balance state.
- Pending submit state.
- Connection badge states.
- Market row rendering.

### Backend integration tests

Critical scenarios:

- Register creates exactly one initial balance.
- Market BUY/SELL transaction.
- Concurrent insufficient balance protection.
- Limit reservation.
- Limit cancellation and release.
- Limit fill.
- Double-fill prevention.

### E2E

Critical portfolio flow:

```text
Register
-> Login/session
-> Open BTC market
-> Place paper BUY
-> Portfolio reflects holding
```

Later:

```text
Create limit order
-> Cancel
-> locked funds released
```

---

## 22. Task execution workflow

When the user gives a task ID such as `G08`, `L05`, or `M03`:

### Step 1 — Understand

Read:

- The task entry in `docs/14_TASK_BACKLOG.md`.
- The directly relevant screen/domain/API/realtime documents.
- Existing code in the target feature.

### Step 2 — Inspect before editing

Check:

- Current implementation.
- Existing patterns.
- Types/contracts.
- Tests.
- Nearby dependencies.

Do not rewrite a feature merely because another style is possible.

### Step 3 — Plan

Create a short implementation plan covering:

- Files likely to change.
- Data flow.
- Edge cases.
- Tests.

For a small straightforward task, keep the plan concise.

### Step 4 — Implement focused scope

Implement the requested task and its direct technical dependencies only.

Do not silently start unrelated backlog items.

Do not perform broad refactors unless required for correctness or explicitly requested.

### Step 5 — Validate

Run applicable checks:

```text
lint
typecheck
unit tests
integration tests
build
```

For UI tasks also review:

- Desktop.
- Mobile.
- Loading/error/empty states.
- Keyboard interaction.

For realtime tasks also review:

- Subscription cleanup.
- Reconnect.
- Re-subscribe.
- Duplicate listeners.
- Route/symbol change.

### Step 6 — Self-review against requirements

Before marking complete, verify the relevant acceptance criteria in `docs/screens/*` and requirement files.

### Step 7 — Report clearly

Final task report should state:

- What changed.
- Important design decisions.
- Tests/checks run.
- Any known limitation or follow-up.

Do not claim tests passed if they were not run.

---

## 23. Backlog discipline

The project backlog uses IDs:

```text
A01 ... P12
```

When a task ID is specified, treat that task as the primary scope.

Direct prerequisite work is allowed when necessary, but explain it.

Do not mark or implement later epics merely because they appear related.

Recommended high-level order:

```text
A Repository foundation
B Design system/app shell
C Market overview
D Trading static UI
E Market data backend
F Application WebSocket
G Frontend realtime
H Chart
I Authentication
J Market orders
K Portfolio
L Limit orders
M Orders page
N Watchlist
O Testing/quality
P Performance/deployment
```

Some tasks may be safely parallelized, but avoid implementing business features before foundational contracts/data flows exist.

---

## 24. Coding conventions

TypeScript:

- `strict: true`.
- Avoid `any`.
- Prefer explicit domain types.
- Prefer discriminated unions for event/state variants.

Naming:

- Components: `PascalCase.tsx`.
- Hooks: `useSomething.ts`.
- Nest: `*.controller.ts`, `*.service.ts`, `*.module.ts`.

Comments:

Comment **why**, not obvious **what**.

Good:

```ts
// Presentation is throttled to 20fps while every order-book delta is still ingested.
```

Bad:

```ts
// Set price
setPrice(price);
```

Avoid catch-all folders/files such as:

```text
helpers/
misc/
utils/utils2.ts
common/everything/
```

Every module should have a clear responsibility.

---

## 25. Git/commit style

Prefer small focused commits.

Examples:

```text
feat(trading): add order book snapshot reducer
fix(realtime): prevent duplicate subscriptions after reconnect
test(orders): cover limit-buy locked balance release
```

Do not mix large unrelated changes into one commit when avoidable.

---

## 26. Definition of done for a coding task

A task is not complete merely because the happy path appears visually correct.

Before completion verify, as applicable:

- Requirement acceptance criteria satisfied.
- TypeScript typecheck passes.
- Lint passes.
- Relevant tests pass.
- New logic has tests where appropriate.
- Loading state considered.
- Empty state considered.
- Error state considered.
- Mobile layout considered.
- Keyboard/accessibility considered.
- No obvious listener/subscription leak.
- No unbounded realtime array/map growth.
- No sensitive logging.
- Financial truth remains backend-authoritative.
- No unrelated scope added.

---

## 27. Definition of done for the overall portfolio project

A recruiter should be able to perform this flow reliably:

```text
1. Open PulseTrade.
2. Observe BTC/ETH prices updating live.
3. Open BTC/USD.
4. View realtime candlestick chart.
5. View changing order book.
6. View recent market trades.
7. Create an account.
8. Receive $10,000 virtual USD.
9. Buy BTC using paper trading.
10. See portfolio update.
11. See P&L react to market price changes.
12. Create a limit order.
13. See the limit order fill when conditions are met, or cancel it.
14. View order history.
15. Reload the app and confirm persistent user/trading data remains correct.
```

The experience should feel like a real application, not a CRUD demo.

---

## 28. Agent behavior rules

The coding agent must:

- Preserve user-written code unless change is needed.
- Prefer existing project patterns over introducing new libraries.
- Explain architecture-impacting changes.
- Avoid dependency additions when built-in/existing solutions are sufficient.
- Never hide failing tests by deleting or weakening them.
- Never bypass TypeScript errors using `any`, `@ts-ignore`, or broad unsafe casts without a justified reason.
- Never bypass backend validation because frontend already validates.
- Never trust external market payloads without normalization/validation.
- Never use polling to imitate realtime when WebSocket is part of the requirement.
- Never persist every raw market tick to PostgreSQL in MVP.
- Never let market provider-specific data structures leak throughout the application.
- Never claim a task is complete without checking the relevant requirements.

When there are several technically valid solutions, choose the one that is easiest to explain, test, and maintain in a portfolio interview.

