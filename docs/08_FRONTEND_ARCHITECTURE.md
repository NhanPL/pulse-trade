# 08 — Frontend Architecture

## 1. Core rule

Do not put all state in one place.

Separate:

1. Server state.
2. Realtime streaming state.
3. Local UI/form state.
4. Imperative third-party chart state.

## 2. State ownership

### TanStack Query — server state

Examples:

- `me`
- portfolio snapshot.
- order lists/details.
- watchlist.
- historical candle bootstrap if loaded via app REST API.

### Zustand — realtime/client app state

Examples:

- socket connection status.
- ticker map by symbol.
- order-book state by active symbol.
- recent-trades bounded buffers.
- current market freshness.

### React local state

Examples:

- selected tab.
- open/closed modal/drawer.
- temporary sort direction.
- one component's UI-only interaction state.

### React Hook Form

Owns order/auth form state and validation lifecycle.

### Lightweight Charts instance

Keep chart API/series references in refs/adapter hook rather than serializing the whole chart state into React.

## 3. Suggested feature modules

```text
features/
  auth/
  market/
  realtime/
  trading/
  orders/
  portfolio/
  watchlist/
```

Each feature may contain:

```text
api/
components/
hooks/
model/
schemas/
types/
utils/
```

Do not create empty folders only to satisfy a pattern.

## 4. Shared UI

`components/ui` contains generic primitives only:

- Button.
- Input.
- Select.
- Tabs.
- Modal/Drawer.
- Badge.
- Table primitives.
- Skeleton.
- Tooltip.
- EmptyState.
- ErrorState.

A component containing trading-domain vocabulary belongs in a feature, not generic UI.

Bad:

```text
components/ui/OrderBook.tsx
```

Better:

```text
features/trading/components/order-book/OrderBook.tsx
```

## 5. Market store shape

Example conceptual shape:

```ts
type MarketRealtimeState = {
  connection: ConnectionState;
  tickers: Record<Symbol, Ticker>;
  freshness: Record<Symbol, MarketFreshness>;
  updateTicker: (ticker: Ticker) => void;
};
```

Consumers subscribe narrowly:

```text
MarketPrice(BTC) -> only BTC price
ConnectionBadge -> only connection state
```

Avoid a selector returning the entire `tickers` map for one price component.

## 6. Order-book model

Internal representation:

```text
bids: Map<priceString, quantityString>
asks: Map<priceString, quantityString>
```

Processing:

1. Apply snapshot.
2. Apply deltas.
3. Remove quantity-zero levels.
4. At render cadence, derive sorted top N rows.

Do not sort the entire book on every incoming delta if avoidable.

## 7. Recent trades buffer

Store latest 50–100 normalized trades.

On new batch:

```text
new + existing
-> deduplicate if provider can resend
-> sort/keep latest
-> slice max length
```

## 8. Realtime client layer

Create an application service such as:

```text
lib/realtime/
  RealtimeClient.ts
  subscription-manager.ts
  event-router.ts
```

Responsibilities:

- Open/close socket.
- Parse/validate envelopes.
- Reconnect.
- Re-subscribe.
- Dispatch normalized events to feature stores.

React components should not manually implement socket reconnect code.

## 9. Query key conventions

Example:

```ts
queryKeys.me.all
queryKeys.portfolio.all
queryKeys.orders.list(filters)
queryKeys.orders.detail(id)
queryKeys.watchlist.all
```

Centralize feature query-key factories to make invalidation predictable.

## 10. Order mutation flow

Example market BUY:

```text
OrderForm submit
    │
    ▼
POST /orders
    │
    ├─ success -> toast
    ├─ invalidate/patch orders
    └─ invalidate/patch portfolio
```

Do not optimistically alter authoritative wallet balances before backend confirms the order unless rollback is fully correct. For MVP, prefer immediate loading state + server confirmation.

## 11. Portfolio realtime flow

REST returns cost basis and balances.

Realtime store returns current prices.

Derived selector/view model calculates display:

```text
position quantity + average cost + current ticker
                      │
                      ▼
              current value / unrealized P&L
```

Do not refetch `/portfolio` on every price tick.

## 12. Server/Client Component boundary

Client Components required for:

- WebSocket-backed components.
- Interactive chart.
- Order form.
- live portfolio values.
- client search/sort interactions.

Server Components may be used for:

- Static route shell.
- metadata.
- non-interactive content.

Do not over-engineer server rendering if it complicates realtime logic without benefit.

## 13. Error boundaries

Use route/feature error boundaries where a chart/widget failure should not blank the whole application.

Distinguish:

- fatal page error.
- one-widget load error.
- realtime stale/disconnected state.
- business mutation rejection.

## 14. Responsive architecture

Do not create completely separate duplicated desktop/mobile business components.

Prefer:

- shared domain components.
- responsive layout wrappers.
- mobile tabs/drawers controlling which shared component is visible.

Example Trading page:

Desktop:

```text
Chart        OrderBook
Trades       OrderForm
```

Mobile:

```text
Ticker
Chart
[Book] [Trades]
OrderForm
```

## 15. Performance checklist

- Narrow Zustand selectors.
- Memoize derived row data only where measurement justifies it.
- Stable keys.
- Bounded lists.
- Avoid JSON parsing/transform duplication per component.
- No socket creation in component render.
- No full-page React state for chart points.
- Throttle visual order-book snapshots if upstream rate is high.
- Use React Profiler before/after optimization and document one measured improvement for the portfolio README.
