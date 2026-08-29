# 01 — Product Requirements

## 1. Requirement priorities

- **P0** — required for MVP/demo.
- **P1** — important polish after P0.
- **P2** — future enhancement.

## 2. Authentication requirements

### AUTH-001 — Register [P0]

A guest can register using email, password and password confirmation.

Acceptance rules:

- Email is required and syntactically valid.
- Email is unique case-insensitively.
- Password minimum length: 8 characters.
- Password confirmation must match.
- Backend hashes password before persistence.
- On successful account creation, initial virtual USD balance is created atomically.
- Default initial available balance: USD 10,000.00.
- User must never receive duplicate initial funding on repeated requests.

### AUTH-002 — Login [P0]

- User can log in with email/password.
- Generic error is returned for invalid credentials.
- Auth state persists across page reload using a secure refresh/session mechanism.
- Private routes redirect unauthenticated users to login and preserve the intended return URL where practical.

### AUTH-003 — Logout [P0]

- Logout invalidates the current refresh/session credential.
- Frontend clears in-memory authentication state.
- Private data is removed from the client cache.

## 3. Market overview requirements

### MARKET-001 — Market list [P0]

Show curated markets with:

- Symbol.
- Base asset.
- Quote asset.
- Current price.
- 24h percentage change.
- 24h high.
- 24h low.
- 24h volume.
- Live/stale status when appropriate.

### MARKET-002 — Live ticker [P0]

- Visible market prices update without page reload.
- Update rendering must be scoped so one ticker update does not re-render the entire page.
- Numeric formatting must be appropriate to asset price magnitude.

### MARKET-003 — Search [P0]

- Search by symbol/base asset.
- Case-insensitive.
- Client-side filtering is sufficient for MVP.

### MARKET-004 — Sorting [P1]

Sort by:

- Price.
- 24h change.
- Volume.

Optional quick filters:

- Top gainers.
- Top losers.
- Highest volume.

## 4. Trading workspace requirements

### TRADE-001 — Route [P0]

Route: `/trade/[symbol]`.

- Invalid/unsupported symbol displays a clear not-found/unsupported-market state.
- Market data viewing is public.
- Order placement requires authentication.

### TRADE-002 — Header ticker [P0]

Display:

- Symbol.
- Current price.
- 24h change.
- 24h high.
- 24h low.
- 24h volume.
- Connection/live status.

### TRADE-003 — Candlestick chart [P0]

Required:

- Candlestick OHLC rendering.
- Historical snapshot load.
- Current candle update from realtime data.
- Timeframes: 1m, 5m, 15m, 1h.
- Resize with container.
- Zoom/pan interaction.
- Skeleton/loading state.
- Error/retry state.

### TRADE-004 — Order book [P0]

Display top 10–20 bid/ask price levels.

Behavior:

- Initialize from a snapshot.
- Apply incremental updates.
- Delete a level when quantity becomes zero.
- Bids sorted descending.
- Asks sorted ascending.
- Rendering may be throttled/aggregated independently from message ingestion.

### TRADE-005 — Recent trades [P0]

Display:

- Execution price.
- Quantity.
- Time.
- Aggressor/side when provider semantics support it.

Rules:

- Keep a bounded list, e.g. latest 50 items.
- Never let an in-memory list grow indefinitely.

### TRADE-006 — Subscription lifecycle [P0]

When entering a market page:

- Subscribe only to necessary symbol/channels.

When switching symbol/unmounting:

- Unsubscribe obsolete subscriptions.
- Do not leave duplicate listeners after navigation.

## 5. Realtime connection requirements

### RT-001 — Connection state [P0]

Represent at least:

- CONNECTING
- CONNECTED
- RECONNECTING
- DISCONNECTED

### RT-002 — Reconnect [P0]

- Unexpected disconnection triggers automatic reconnect.
- Use bounded exponential backoff with jitter.
- Reset backoff after stable reconnection.
- Avoid multiple concurrent socket instances.

### RT-003 — Stale data [P0]

- Track last received market update timestamp.
- If no fresh update is received for the configured threshold, mark data as stale/delayed.
- UI must not silently present stale data as live.

### RT-004 — Heartbeat [P0]

- Maintain provider/client connection using the provider-required heartbeat/ping mechanism.
- Detect dead connections even when browser/network does not immediately fire close.

## 6. Paper trading requirements

### ORDER-001 — Supported sides [P0]

- BUY
- SELL

No short selling.

### ORDER-002 — Supported order types [P0]

- MARKET
- LIMIT

No stop-loss/take-profit in MVP.

### ORDER-003 — Market BUY [P0]

- User supplies positive quantity.
- Backend obtains trusted current execution price.
- User must have enough available quote currency.
- Order, trade, balances and position updates happen atomically.
- Result status is FILLED on success.

### ORDER-004 — Market SELL [P0]

- User must have enough available base asset.
- Cannot sell locked amount.
- Order/trade/balance/position changes happen atomically.

### ORDER-005 — Limit BUY [P0]

On creation:

- Limit price and quantity must be positive.
- Required quote amount = limit price × quantity.
- Required quote amount moves from available to locked.
- Order status becomes PENDING.

Trigger:

- Eligible when market price <= limit price.

On fill:

- Execution price must not violate the user's limit.
- Actual spend is deducted from locked funds.
- Any unused locked quote amount is released.
- Position and trade history are updated atomically.

### ORDER-006 — Limit SELL [P0]

On creation:

- Required base quantity moves from available to locked.
- Order status becomes PENDING.

Trigger:

- Eligible when market price >= limit price.

On fill:

- Locked base amount is consumed.
- Quote proceeds are credited.
- Position and trade history are updated atomically.

### ORDER-007 — Cancel limit order [P0]

Only PENDING orders may be cancelled.

Cancellation must atomically:

- Transition status PENDING -> CANCELLED.
- Release any associated locked balance.

FILLED/CANCELLED/REJECTED orders cannot be cancelled.

### ORDER-008 — Status values [P0]

- PENDING
- FILLED
- CANCELLED
- REJECTED

The design may later support PARTIALLY_FILLED but MVP should not require partial-fill simulation.

### ORDER-009 — Idempotency [P1]

Order creation should support a client-generated idempotency key to protect against duplicate submits/retries.

## 7. Portfolio requirements

### PORT-001 — Wallet balances [P0]

For each asset show:

- Available balance.
- Locked balance.
- Total = available + locked.

### PORT-002 — Holdings [P0]

For non-zero positions show:

- Asset.
- Quantity.
- Average cost.
- Current price.
- Current market value.
- Unrealized P&L amount.
- Unrealized P&L percentage.

### PORT-003 — Total portfolio value [P0]

Value all assets in USD using latest trusted market price.

If a required market price is stale/unavailable, UI must indicate partial/stale valuation rather than inventing a value.

### PORT-004 — Realized P&L [P0]

Persist and display realized P&L using the project's weighted-average cost method.

### PORT-005 — Realtime valuation [P0]

Portfolio market value and unrealized P&L update when relevant market prices stream in without requiring API refetch for every tick.

## 8. Orders requirements

### HISTORY-001 — Open orders [P0]

Display PENDING orders with cancel action.

### HISTORY-002 — Order history [P0]

Display:

- Symbol.
- Side.
- Type.
- Quantity.
- Limit price if applicable.
- Average execution price if filled.
- Status.
- Created time.
- Filled/cancelled time.

### HISTORY-003 — Filtering [P1]

Filter by:

- Status.
- Side.
- Symbol.

## 9. Watchlist requirements

### WATCH-001 — Add [P0]

Authenticated user can add a supported market symbol.

### WATCH-002 — Remove [P0]

Authenticated user can remove a market symbol.

### WATCH-003 — Persistence [P0]

Watchlist persists across login/logout and page reload.

### WATCH-004 — Duplicate prevention [P0]

The same symbol cannot be added twice for one user.

## 10. UX requirements

### UX-001 — Responsive design [P0]

Support:

- Desktop.
- Tablet.
- Mobile.

Mobile trading layout must reorganize content rather than shrink the desktop grid.

### UX-002 — Loading [P0]

Use contextual skeleton/loading states for:

- Market table.
- Chart.
- Portfolio cards/table.
- Orders table.

### UX-003 — Empty states [P0]

Provide useful empty states for:

- No holdings.
- No orders.
- Empty watchlist.
- No search result.

### UX-004 — Error states [P0]

Handle:

- API unavailable.
- Realtime unavailable.
- Unsupported symbol.
- Authentication expired.
- Order rejected.
- Insufficient balance.

### UX-005 — Accessibility [P1]

- Keyboard-accessible interactive elements.
- Visible focus state.
- Form labels and error associations.
- Semantic tables where appropriate.
- Positive/negative values include `+/-` text; never communicate meaning by color alone.

## 11. Non-functional requirements

### NFR-001 — Type safety [P0]

- TypeScript strict mode.
- Avoid `any` except documented third-party boundary cases.
- Shared request/response/WebSocket schemas where practical.

### NFR-002 — Financial precision [P0]

- Persist price, quantity, balances and P&L using decimal-capable database types.
- Do not rely on JavaScript binary floating-point for authoritative balance calculations.
- API financial values should be transported as decimal strings unless a carefully bounded integer-unit strategy is used.

### NFR-003 — Performance [P0]

- Realtime state updates must be granular.
- Order-book UI rendering may be throttled separately from message ingestion.
- Recent trades arrays must be bounded.
- No repeated WebSocket listener leaks after navigation.

### NFR-004 — Reliability [P0]

- Trading mutations are transactional.
- Pending-order fill logic is idempotent.
- Reconnect does not duplicate subscriptions.

### NFR-005 — Observability [P1]

- Structured backend logs.
- Frontend production error reporting.
- Record socket connection/reconnect metrics/log events.

## 12. Definition of Done for MVP

MVP is done only when all P0 requirements work end-to-end in production-like deployment and the following scenario passes:

1. Register.
2. Receive USD 10,000 exactly once.
3. Open BTC-USD.
4. Observe ticker/chart/order book/recent trades.
5. Place market BUY.
6. Observe holdings and P&L.
7. Place a limit order.
8. Cancel it and verify locked funds return.
9. Place another eligible limit order and verify automatic fill.
10. Reload and verify account state persists.
11. Disconnect/reconnect network and verify live status/recovery.
