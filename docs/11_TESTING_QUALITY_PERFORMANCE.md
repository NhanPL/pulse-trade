# 11 — Testing, Quality & Performance

## 1. Testing pyramid for this project

Focus most unit tests on deterministic domain logic and a smaller number of E2E tests on critical workflows.

## 2. Frontend unit tests

Use Vitest for:

- Price/quantity format helpers.
- Order-book delta reducer/model.
- Bounded recent-trade buffer.
- Connection backoff calculation.
- P&L display derivation.
- Form schemas.

## 3. Frontend component tests

Use React Testing Library for:

### OrderForm

- Quantity required.
- Quantity > 0.
- Limit price required only for LIMIT.
- Insufficient-balance backend error display.
- Submit loading state.
- Market/Limit tab behavior.

### ConnectionStatus

- Connected.
- Reconnecting.
- Stale.

### MarketTable

- Search.
- Sort.
- empty search result.

### OrdersTable

- Pending order shows cancel action.
- Filled order does not show cancel action.

## 4. Backend unit tests

Prioritize pure domain functions:

- weighted average cost.
- realized P&L.
- limit trigger predicate.
- reservation amount.
- supported-market parsing.

## 5. Backend integration tests

Critical cases:

### Registration

- Creates user + USD balance atomically.
- Duplicate email rejected.
- Initial funding not duplicated.

### Market BUY

- Success.
- Insufficient USD.
- Stale market data rejected.

### Market SELL

- Success.
- Insufficient asset.

### Limit BUY

- Funds move available -> locked.
- Cancellation returns lock.
- Fill consumes lock and releases price improvement remainder.

### Limit SELL

- Asset moves available -> locked.
- Cancellation returns lock.
- Fill consumes locked asset.

### Concurrency

- Two concurrent orders cannot overspend one wallet.
- Two evaluators cannot fill one pending order twice.

## 6. E2E tests

Use Playwright.

### E2E-01 — Registration and market BUY

1. Register.
2. Verify authenticated state.
3. Open BTC-USD.
4. Enter market BUY quantity.
5. Submit.
6. Verify success.
7. Open portfolio.
8. Verify BTC holding exists.

### E2E-02 — Limit order cancellation

1. Login seeded user.
2. Create limit BUY away from current market.
3. Verify order PENDING.
4. Verify USD locked amount.
5. Cancel.
6. Verify CANCELLED.
7. Verify locked amount released.

### E2E-03 — Watchlist

- Add symbol.
- Reload.
- Verify persistence.
- Remove symbol.

## 7. Realtime tests

Use a deterministic mocked realtime server/provider in tests.

Test:

- Snapshot then delta.
- Reconnect.
- Re-subscribe after reconnect.
- Duplicate subscription prevention.
- Stale timeout.
- Order-book sequence gap recovery if implemented.

Do not make CI depend on public exchange uptime.

## 8. Performance targets

Avoid fake enterprise SLAs. Use practical measurable targets.

Suggested local/demo goals:

- No visible UI freeze during normal market update rates.
- Chart pan/zoom stays smooth.
- Order-book updates do not cause whole trading page re-render.
- Recent trade list remains bounded.
- Route switching does not increase active socket listener count indefinitely.

## 9. Performance verification

Use React Profiler to compare before/after an optimization.

Document at least one case, for example:

```text
Before:
Every ticker update re-rendered TradingPage + ChartPanel + OrderForm.

After:
Narrow Zustand selectors isolated price updates to MarketPrice and dependent widgets.
```

This evidence is valuable in a portfolio README/interview.

## 10. Order-book performance strategy

Separate:

- ingestion frequency.
- presentation frequency.

Example:

- Apply every valid delta to in-memory map.
- Derive top 20 rows at `requestAnimationFrame` or controlled interval.
- Update React row view only when derived top levels change.

Measure before choosing a throttle interval.

## 11. Quality gates

Pull request/CI should fail on:

- Lint error.
- Type error.
- Unit/integration test failure.
- Build failure.

Production deployment should not happen from an unverified broken branch.

## 12. Accessibility checklist

- Tab order logical.
- Inputs have visible labels.
- Errors linked using accessible descriptions.
- Focus restored/managed for dialogs/drawers.
- Buttons have accessible names.
- Data tables use headers.
- Profit/loss includes text signs, not color only.
- Mobile touch targets are usable.
