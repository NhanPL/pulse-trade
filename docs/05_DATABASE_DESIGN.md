# 05 — Database Design

## 1. Database goals

PostgreSQL stores business truth, not high-frequency external market ticks.

Persist:

- Identity/session data.
- Wallet balances.
- Positions/cost basis.
- Orders.
- Trade executions.
- Watchlist.

Do not persist every ticker/order-book update in MVP.

## 2. Entity relationship overview

```text
users
  │1
  ├──────< sessions
  │
  ├──────< wallet_balances
  │
  ├──────< positions
  │
  ├──────< orders ──────< trades
  │
  └──────< watchlist_items
```

## 3. `users`

Suggested fields:

```text
id                uuid pk
email             varchar unique
password_hash     varchar
created_at        timestamptz
updated_at        timestamptz
```

Rules:

- Normalize email before storing/comparing.
- Never store plaintext password.

## 4. `sessions`

Suggested fields:

```text
id                    uuid pk
user_id               uuid fk -> users
refresh_token_hash    varchar
expires_at            timestamptz
revoked_at            timestamptz nullable
created_at            timestamptz
last_used_at           timestamptz nullable
user_agent             varchar nullable
```

Purpose:

- Server-side session revocation.
- Rotate/invalidate refresh credentials.

## 5. `wallet_balances`

One row per user/asset.

```text
id             uuid pk
user_id        uuid fk -> users
asset          varchar
available      numeric(...)
locked         numeric(...)
created_at     timestamptz
updated_at     timestamptz
```

Constraints:

```text
UNIQUE(user_id, asset)
CHECK available >= 0
CHECK locked >= 0
```

Examples:

```text
(user A, USD, available=9400, locked=0)
(user A, BTC, available=0.01, locked=0)
```

## 6. `positions`

Tracks cost basis independently from wallet reservation state.

```text
id                  uuid pk
user_id             uuid fk -> users
asset               varchar
quantity            numeric(...)
average_cost_usd    numeric(...)
realized_pnl_usd    numeric(...)
created_at          timestamptz
updated_at          timestamptz
```

Constraints:

```text
UNIQUE(user_id, asset)
CHECK quantity >= 0
```

Notes:

- For MVP, quantity should stay consistent with total owned base amount represented by wallet balances for non-USD assets.
- Cost basis uses weighted-average method.

## 7. `orders`

Suggested fields:

```text
id                    uuid pk
user_id               uuid fk -> users
symbol                 varchar
base_asset             varchar
quote_asset            varchar
side                   enum BUY|SELL
type                   enum MARKET|LIMIT
status                 enum PENDING|FILLED|CANCELLED|REJECTED
quantity               numeric(...)
limit_price            numeric(...) nullable
filled_quantity        numeric(...)
avg_fill_price          numeric(...) nullable
reserved_asset         varchar nullable
reserved_amount        numeric(...) default 0
idempotency_key        varchar nullable
created_at             timestamptz
updated_at             timestamptz
filled_at              timestamptz nullable
cancelled_at           timestamptz nullable
rejection_reason_code  varchar nullable
```

Constraints:

- `quantity > 0`.
- MARKET => `limit_price IS NULL`.
- LIMIT => `limit_price > 0`.
- Unique `(user_id, idempotency_key)` when idempotency key is not null.

Why store reservation metadata:

- Easier auditing/cancellation.
- Do not have to reconstruct original reservation from mutable external prices.

## 8. `trades`

Immutable execution/fill record.

```text
id               uuid pk
order_id         uuid fk -> orders
user_id          uuid fk -> users
symbol           varchar
side             enum BUY|SELL
price            numeric(...)
quantity         numeric(...)
quote_amount     numeric(...)
executed_at      timestamptz
```

MVP may create one trade per filled order, but the schema supports multiple trades per order later.

## 9. `watchlist_items`

```text
id            uuid pk
user_id       uuid fk -> users
symbol        varchar
created_at    timestamptz
```

Constraint:

```text
UNIQUE(user_id, symbol)
```

## 10. Optional `order_events` [P2]

If richer audit history is desired:

```text
id
order_id
event_type
payload_json
created_at
```

Not needed for MVP.

## 11. Indexes

At minimum consider:

```text
users(email)
sessions(user_id, expires_at)
wallet_balances(user_id, asset)
positions(user_id, asset)
orders(user_id, created_at desc)
orders(user_id, status, created_at desc)
orders(status, symbol)        -- pending evaluator
trades(user_id, executed_at desc)
watchlist_items(user_id)
```

## 12. Transaction boundaries

Must be atomic:

### Registration

- create user.
- create initial USD wallet.

### Create market order

- validate/lock balances.
- create order.
- update balances.
- update position.
- create trade.

### Create limit order

- validate balance.
- move available -> locked.
- create pending order.

### Fill pending order

- verify pending.
- consume/release locked balance.
- update wallet/position.
- create trade.
- mark filled.

### Cancel pending order

- verify pending.
- release locked balance.
- mark cancelled.

## 13. Market symbols

MVP does not require a database `markets` table if supported symbols are a small static configuration.

Example code/config:

```ts
const SUPPORTED_MARKETS = {
  'BTC-USD': { base: 'BTC', quote: 'USD' },
  'ETH-USD': { base: 'ETH', quote: 'USD' },
};
```

A database table can be added later if symbol administration becomes a requirement.
