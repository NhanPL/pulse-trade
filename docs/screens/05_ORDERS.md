# Screen 05 — Orders

Route: `/orders`

Access: Authenticated.

## 1. Goal

Allow the user to understand pending orders and immutable trading history, and cancel eligible pending limit orders.

## 2. Layout

```text
Orders
[Open Orders] [History]

Filters: Symbol | Side | Status

Table/Card list
```

Desktop uses table.

Below the `md` breakpoint (768px), Open Orders and History use labelled order cards without horizontal scrolling. Tables remain visible at `md` and above.

Cards share the same query, filters, pagination, status/timestamp presentation, and cancellation flow as desktop. Only pending limit orders show Cancel, with a full-width 44px touch target. Quantities remain complete decimal strings and wrap instead of being truncated.

## 3. Component tree

```text
OrdersPage
├─ OrdersTabs
│  ├─ OpenOrdersTab
│  └─ OrderHistoryTab
├─ OrderFilters
│  ├─ SymbolFilter
│  ├─ SideFilter
│  └─ StatusFilter
├─ OrdersList
│  └─ OrderRow[]
│     ├─ OrderIdentity
│     ├─ OrderPriceQuantity
│     ├─ OrderStatusBadge
│     ├─ OrderTimestamp
│     └─ CancelOrderButton (conditional)
└─ CancelOrderDialog
```

## 4. Fields

Show:

- Symbol.
- Side.
- Type.
- Quantity.
- Limit price for LIMIT.
- Average fill price for FILLED.
- Status.
- Created time.
- Filled/cancelled time when available.

## 5. Open Orders tab

Query:

```text
status=PENDING
```

Every row has cancel action.

After cancellation:

- order becomes CANCELLED.
- portfolio/balances update because locked funds are released.

## 6. Cancellation UX

Use confirmation dialog:

```text
Cancel this BTC-USD limit BUY?
Reserved funds will be released.
```

Race condition:

Order may fill between page display and cancel click.

Backend can return `ORDER_NOT_CANCELLABLE`.

Frontend should:

- Explain order is no longer pending.
- Refresh order/portfolio state.

## 7. History tab

Default newest first.

Use pagination/infinite load if needed.

Do not load unlimited history into browser memory.

## 8. Filters

P1 filters:

- symbol.
- side.
- status.

Filter state may be stored in URL search params for shareability/back-navigation.

## 9. Empty states

Open orders:

```text
You have no open orders.
```

History:

```text
You haven't placed any orders yet.
```

## 10. Acceptance criteria

- [ ] Protected route.
- [ ] Pending orders displayed.
- [ ] Only pending orders can be cancelled.
- [ ] Cancellation releases locked balance.
- [ ] Race/conflict handled gracefully.
- [ ] History persists across reload.
- [ ] Filtering works when implemented.
- [ ] Mobile view readable.
