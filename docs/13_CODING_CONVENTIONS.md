# 13 — Coding Conventions

## 1. TypeScript

- `strict: true`.
- Avoid `any`.
- Prefer discriminated unions for event/order states.
- Financial decimal values at API boundaries use strings.
- Validate untrusted runtime payloads; TypeScript types alone are not runtime validation.

## 2. Components

Keep components focused.

A component should generally own one presentation responsibility.

Prefer composition over one 800-line TradingPage component.

## 3. Hooks

Custom hooks should represent reusable behavior/data access, not merely hide every two-line `useState`.

Examples worth a hook:

- `useMarketSubscription(symbol)`.
- `usePortfolioViewModel()`.
- `useOrderFormBalances(symbol)`.

## 4. Domain calculations

Keep deterministic calculations in pure functions where possible.

Examples:

- weighted average.
- realized P&L.
- limit eligibility.
- order cost/reservation.

Pure functions are easier to test and discuss in interviews.

## 5. Error handling

Backend:

- Throw/return typed domain errors.
- Map them centrally to HTTP status + stable code.

Frontend:

- API layer converts response errors into typed application errors.
- Components render by error code/category rather than parsing text.

## 6. Comments

Comment **why**, not obvious **what**.

Good:

```ts
// Rendering the order book is intentionally throttled; ingestion still applies every delta.
```

Bad:

```ts
// Set price
setPrice(price);
```

## 7. Realtime lifecycle

Every subscription/listener must have an explicit cleanup path.

For each new realtime feature review:

- Who subscribes?
- Who owns it?
- Who unsubscribes?
- What happens on reconnect?
- What happens on symbol change?

## 8. Import boundaries

Suggested dependency direction:

```text
app -> features -> shared ui/lib -> contracts
```

Feature A should not casually reach into Feature B internals.

Expose intended feature APIs through index files only when that improves clarity; do not create barrel files everywhere automatically.

## 9. Git commits

Prefer small meaningful commits, for example:

```text
feat(trading): add order book snapshot reducer
fix(realtime): prevent duplicate subscriptions after reconnect
test(orders): cover limit-buy locked balance release
```

## 10. Pull request/self-review checklist

Before considering a task complete:

- Requirement acceptance criteria pass.
- Typecheck passes.
- Tests added/updated.
- Loading/error/empty states considered.
- Mobile checked.
- Keyboard/accessibility checked for interactive feature.
- No sensitive logs.
- No obvious subscription/listener leak.
- Financial calculation remains backend-authoritative.
