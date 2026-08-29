# 04 — Domain & Business Rules

## 1. Terminology

- **Base asset**: first asset in pair, e.g. BTC in BTC-USD.
- **Quote asset**: asset used to price base asset, e.g. USD.
- **Available balance**: amount available for a new order.
- **Locked balance**: amount reserved by pending orders.
- **Position**: cost-basis state used to calculate P&L for an owned asset.
- **Market order**: executes immediately using trusted current market price.
- **Limit order**: waits until market reaches a user-defined price boundary.
- **Trade/fill**: immutable execution record produced when an order executes.

## 2. Decimal rules

Authoritative financial fields must not rely on binary floating-point.

Database fields such as these should use `NUMERIC` with suitable precision/scale:

- price.
- quantity.
- available balance.
- locked balance.
- average cost.
- realized P&L.

Transport them over API as strings, for example:

```json
{
  "price": "67542.31000000",
  "quantity": "0.01000000"
}
```

Frontend formats for display.

## 3. Wallet invariant

For every `(user, asset)`:

```text
available >= 0
locked >= 0
total = available + locked
```

No business operation may commit a negative balance.

## 4. Registration funding

When a user is created:

- Create user.
- Create USD wallet balance with available `10000.00`.
- Create zero locked amount.

All actions occur in one database transaction.

Funding must be exactly-once for each account.

## 5. Market BUY

Input:

- symbol.
- quantity > 0.

Trusted execution price comes from backend market state.

Cost:

```text
cost = execution_price × quantity
```

Requirement:

```text
quote.available >= cost
```

Atomic result:

1. Create FILLED order.
2. Decrease quote available by cost.
3. Increase base available by quantity.
4. Update base position weighted-average cost.
5. Create immutable trade record.

## 6. Market SELL

Requirement:

```text
base.available >= quantity
```

Proceeds:

```text
proceeds = execution_price × quantity
```

Atomic result:

1. Create FILLED order.
2. Decrease base available.
3. Increase quote available.
4. Calculate realized P&L.
5. Update remaining base position.
6. Create immutable trade record.

## 7. Weighted-average cost

On BUY:

```text
new_quantity = old_quantity + buy_quantity
new_average_cost =
  (old_quantity × old_average_cost + buy_quantity × buy_price)
  / new_quantity
```

Example:

```text
1 BTC @ 50,000
1 BTC @ 60,000
=> quantity 2 BTC
=> average cost 55,000
```

## 8. Realized P&L

Using weighted-average cost:

```text
realized_pnl_for_sell =
  (sell_price - average_cost_before_sell) × sold_quantity
```

After a SELL:

- Remaining quantity decreases.
- Average cost of remaining quantity stays unchanged.
- If remaining quantity becomes zero, average cost can reset to zero.
- Accumulated realized P&L increases by sell realized P&L.

## 9. Unrealized P&L

```text
unrealized_pnl =
  (current_market_price - average_cost) × current_position_quantity
```

This value is derived for display and changes with current market data.

It does not need to be persisted every market tick.

## 10. Limit BUY reservation

Input:

- limit price > 0.
- quantity > 0.

Reservation:

```text
reserved_quote = limit_price × quantity
```

Requirement:

```text
quote.available >= reserved_quote
```

Atomic creation:

```text
quote.available -= reserved_quote
quote.locked += reserved_quote
order.status = PENDING
```

## 11. Limit SELL reservation

Requirement:

```text
base.available >= quantity
```

Atomic creation:

```text
base.available -= quantity
base.locked += quantity
order.status = PENDING
```

## 12. Limit trigger rules

BUY becomes eligible when:

```text
market_price <= limit_price
```

SELL becomes eligible when:

```text
market_price >= limit_price
```

MVP fill policy:

- Use the trusted latest market price at processing time.
- BUY execution price must be `<= limit_price`.
- SELL execution price must be `>= limit_price`.
- No partial fills in MVP.

## 13. Filling limit BUY

Suppose:

```text
locked = limit_price × quantity
actual_cost = execution_price × quantity
```

Because execution price cannot exceed the BUY limit:

```text
actual_cost <= locked
```

Atomic fill:

1. Verify order still PENDING.
2. Move consumed amount out of quote locked.
3. Release any leftover locked amount back to available.
4. Increase base available.
5. Update weighted-average position.
6. Create trade.
7. Mark order FILLED.

## 14. Filling limit SELL

Atomic fill:

1. Verify order still PENDING.
2. Decrease base locked by quantity.
3. Credit quote available with proceeds.
4. Update position and realized P&L.
5. Create trade.
6. Mark order FILLED.

## 15. Cancellation

Only PENDING orders may be cancelled.

For pending BUY:

```text
quote.locked -= reserved_amount
quote.available += reserved_amount
```

For pending SELL:

```text
base.locked -= reserved_quantity
base.available += reserved_quantity
```

Then:

```text
status = CANCELLED
```

All changes occur atomically.

## 16. Order state machine

```text
                    ┌──────────► FILLED
                    │
CREATE LIMIT ───► PENDING
                    │
                    └──────────► CANCELLED

CREATE MARKET ─────────────────► FILLED

Validation/system rejection ───► REJECTED
```

Do not allow arbitrary status patch endpoints.

## 17. Concurrency requirements

Example dangerous scenario:

```text
USD available = 1,000
Request A BUY cost = 800
Request B BUY cost = 800
```

Both cannot pass based on the same stale balance.

Order placement/fill must use transaction-safe concurrency control.

Strategies may include:

- Row locks where required.
- Serializable transaction for critical section.
- Atomic conditional update.

Implementation choice must have tests for concurrent overspend/double-fill behavior.

## 18. Idempotency

A retried order-create HTTP request must not accidentally create two orders.

P1 approach:

- Client generates `Idempotency-Key`.
- Backend stores `(user_id, idempotency_key)` unique.
- Duplicate request returns original result.

## 19. Historical immutability

Trade records are immutable audit history.

Do not expose an endpoint that edits historical execution price/quantity after a successful fill.
