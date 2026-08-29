# 07 — WebSocket Specification

## 1. Goal

Expose a stable application-specific realtime protocol to the browser.

The browser must not depend on external exchange payload formats.

## 2. Connection

Example application endpoint:

```text
wss://api.example.com/realtime
```

One connection per browser session is preferred.

## 3. Event envelope

Server -> client:

```json
{
  "v": 1,
  "event": "ticker.update",
  "ts": 1787840000000,
  "symbol": "BTC-USD",
  "data": {}
}
```

Fields:

- `v`: protocol version.
- `event`: stable application event name.
- `ts`: server event timestamp in milliseconds.
- `symbol`: market symbol when applicable.
- `data`: event-specific payload.

## 4. Client commands

### `subscribe`

```json
{
  "action": "subscribe",
  "requestId": "uuid",
  "symbols": ["BTC-USD"],
  "channels": ["ticker", "candles", "orderbook", "trades"],
  "options": {
    "candleInterval": "1m"
  }
}
```

### `unsubscribe`

```json
{
  "action": "unsubscribe",
  "requestId": "uuid",
  "symbols": ["BTC-USD"],
  "channels": ["ticker", "candles", "orderbook", "trades"]
}
```

### Optional `ping`

If application-level heartbeat is used:

```json
{
  "action": "ping",
  "ts": 1787840000000
}
```

## 5. Subscription acknowledgment

```json
{
  "v": 1,
  "event": "subscription.ack",
  "ts": 1787840000000,
  "data": {
    "requestId": "uuid",
    "accepted": true
  }
}
```

## 6. `connection.ready`

Sent after connection initialization.

```json
{
  "v": 1,
  "event": "connection.ready",
  "ts": 1787840000000,
  "data": {
    "connectionId": "uuid"
  }
}
```

## 7. `ticker.update`

```json
{
  "v": 1,
  "event": "ticker.update",
  "ts": 1787840000000,
  "symbol": "BTC-USD",
  "data": {
    "price": "67542.31",
    "change24hPercent": "2.41",
    "high24h": "68100.00",
    "low24h": "64821.00",
    "volume24h": "12345.67",
    "marketTs": 1787839999900
  }
}
```

## 8. `candle.snapshot`

May be REST-only, but if sent over WebSocket:

```json
{
  "event": "candle.snapshot",
  "symbol": "BTC-USD",
  "data": {
    "interval": "1m",
    "candles": [
      {
        "time": 1787839980,
        "open": "67400",
        "high": "67600",
        "low": "67320",
        "close": "67542",
        "volume": "12.4"
      }
    ]
  }
}
```

## 9. `candle.update`

```json
{
  "event": "candle.update",
  "symbol": "BTC-USD",
  "data": {
    "interval": "1m",
    "candle": {
      "time": 1787839980,
      "open": "67400",
      "high": "67600",
      "low": "67320",
      "close": "67542",
      "volume": "12.4"
    }
  }
}
```

Frontend chart updates current candle directly.

## 10. `orderbook.snapshot`

```json
{
  "event": "orderbook.snapshot",
  "symbol": "BTC-USD",
  "data": {
    "sequence": "123456",
    "bids": [
      ["67540.00", "0.22000000"]
    ],
    "asks": [
      ["67550.00", "0.31000000"]
    ]
  }
}
```

## 11. `orderbook.update`

```json
{
  "event": "orderbook.update",
  "symbol": "BTC-USD",
  "data": {
    "sequence": "123457",
    "changes": [
      {
        "side": "BID",
        "price": "67540.00",
        "quantity": "0.51000000"
      },
      {
        "side": "ASK",
        "price": "67570.00",
        "quantity": "0"
      }
    ]
  }
}
```

Rules:

- Quantity `0` deletes level.
- Client detects missing/out-of-order sequence if sequence semantics are available.
- On suspected gap, rebuild from a fresh snapshot rather than continuing corrupted state.

## 12. `trades.batch`

Batch events to reduce rendering pressure:

```json
{
  "event": "trades.batch",
  "symbol": "BTC-USD",
  "data": {
    "trades": [
      {
        "id": "provider-or-normalized-id",
        "price": "67542.31",
        "quantity": "0.012",
        "side": "BUY",
        "marketTs": 1787839999900
      }
    ]
  }
}
```

## 13. `market.stale`

```json
{
  "event": "market.stale",
  "symbol": "BTC-USD",
  "data": {
    "reason": "UPSTREAM_DISCONNECTED",
    "lastUpdateTs": 1787839900000
  }
}
```

Frontend must visibly mark data stale.

## 14. `market.live`

Sent after a stale stream recovers and a fresh snapshot/update is established.

## 15. `error`

```json
{
  "event": "error",
  "data": {
    "requestId": "uuid",
    "code": "UNSUPPORTED_SYMBOL",
    "message": "Unsupported market symbol."
  }
}
```

## 16. Frontend subscription manager rules

- Deduplicate identical subscriptions.
- Cleanup on route/component lifecycle.
- Re-send active subscriptions after reconnect.
- Never create a new socket on every React render.
- Prevent event listener accumulation.

## 17. Reconnect policy

Suggested delays:

```text
1s -> 2s -> 4s -> 8s -> 15s -> 30s max
```

Add small jitter.

Reset to initial delay after stable connection.

## 18. Backpressure/rendering policy

Message ingestion and UI rendering are separate concerns.

Examples:

- Ticker state can keep latest value.
- Order-book internal map can ingest every valid delta while UI snapshot renders at a controlled cadence.
- Recent trade buffer keeps only latest N items.
- Chart updates current candle imperatively rather than causing the full React page to rerender.
