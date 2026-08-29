# 06 — REST API Design

## 1. API principles

Base prefix:

```text
/api/v1
```

Rules:

- JSON request/response.
- Consistent error envelope.
- Backend authoritative for financial calculations.
- Decimal financial values serialized as strings.
- Authenticated endpoint derives user identity from session/token, never request body `userId`.
- Zod/shared contract validation at boundaries where practical.

## 2. Success envelope

Simple resources may be returned directly. If an envelope is used, use it consistently.

Recommended:

```json
{
  "data": {}
}
```

## 3. Error envelope

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient USD balance.",
    "details": null,
    "requestId": "..."
  }
}
```

Frontend behavior should use stable `code`, not string matching on `message`.

## 4. Authentication

### POST `/auth/register`

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com"
    }
  }
}
```

Side effects:

- Account created.
- USD 10,000 virtual balance created.
- Session may be created immediately depending on UX decision.

### POST `/auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response returns user/session metadata; refresh credential should be handled using secure cookie strategy.

### POST `/auth/refresh`

Rotates/renews access authentication based on refresh/session cookie.

### POST `/auth/logout`

Revokes current session and clears cookie.

### GET `/me`

Returns current authenticated user.

## 5. Market REST endpoints

Realtime values are primarily WebSocket driven, but REST is useful for bootstrap/history.

### GET `/markets`

Returns supported market metadata and current snapshot if available.

Example:

```json
{
  "data": [
    {
      "symbol": "BTC-USD",
      "baseAsset": "BTC",
      "quoteAsset": "USD",
      "price": "67542.31",
      "change24hPercent": "2.41",
      "high24h": "68100.00",
      "low24h": "64821.00",
      "volume24h": "...",
      "asOf": "2026-08-27T12:00:00.000Z"
    }
  ]
}
```

### GET `/markets/:symbol/candles?interval=1m&limit=300`

Returns historical OHLC candles needed before realtime updates.

Validation:

- Supported symbol.
- Supported interval.
- Safe bounded limit.

## 6. Portfolio

### GET `/portfolio`

Authenticated.

Response shape:

```json
{
  "data": {
    "quoteCurrency": "USD",
    "cash": {
      "available": "4500.00",
      "locked": "1000.00"
    },
    "positions": [
      {
        "asset": "BTC",
        "quantity": "0.05000000",
        "averageCost": "60000.00",
        "realizedPnl": "100.00"
      }
    ]
  }
}
```

Current market value/unrealized P&L may be returned as a snapshot, but frontend can update display from realtime prices afterwards.

## 7. Orders

### POST `/orders`

Authenticated.

Request MARKET:

```json
{
  "symbol": "BTC-USD",
  "side": "BUY",
  "type": "MARKET",
  "quantity": "0.01000000"
}
```

Request LIMIT:

```json
{
  "symbol": "BTC-USD",
  "side": "BUY",
  "type": "LIMIT",
  "quantity": "0.01000000",
  "limitPrice": "65000.00"
}
```

Optional header P1:

```text
Idempotency-Key: <uuid>
```

Response:

```json
{
  "data": {
    "id": "uuid",
    "status": "FILLED",
    "symbol": "BTC-USD",
    "side": "BUY",
    "type": "MARKET",
    "quantity": "0.01000000",
    "avgFillPrice": "67542.31"
  }
}
```

Common errors:

- `UNAUTHENTICATED`
- `UNSUPPORTED_SYMBOL`
- `INVALID_QUANTITY`
- `INVALID_LIMIT_PRICE`
- `INSUFFICIENT_BALANCE`
- `MARKET_DATA_UNAVAILABLE`
- `MARKET_DATA_STALE`
- `ORDER_CONFLICT`

### POST `/orders/:id/cancel`

Authenticated.

Rules:

- User owns order.
- Order must be PENDING.
- Releases locked funds atomically.

Common errors:

- `ORDER_NOT_FOUND`
- `ORDER_NOT_CANCELLABLE`

### GET `/orders`

Query parameters:

```text
status=PENDING|FILLED|CANCELLED|REJECTED
side=BUY|SELL
symbol=BTC-USD
cursor=...
limit=20
```

Use pagination even if MVP data is small; cursor pagination is preferred for time-ordered history.

### GET `/orders/:id`

Returns order and executions/trades.

## 8. Watchlist

### GET `/watchlist`

Authenticated.

### POST `/watchlist`

Request:

```json
{
  "symbol": "BTC-USD"
}
```

Duplicate add should be idempotent or return stable duplicate error; choose and document one behavior.

Recommended: idempotent success.

### DELETE `/watchlist/:symbol`

Authenticated.

Removing a missing item can return idempotent success.

## 9. Health

### GET `/health`

Returns process/API health.

### GET `/health/market-data` [P1]

Expose high-level market provider connection health, not secrets.

## 10. API cache invalidation mapping

After successful order create/cancel:

Invalidate/refetch or patch:

- `portfolio`
- `orders`

Do not refetch market ticker because market ticker is WebSocket state.
