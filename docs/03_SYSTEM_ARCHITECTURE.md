# 03 — System Architecture

## 1. High-level architecture

```text
                   ┌─────────────────────────────┐
                   │          Browser            │
                   │ Next.js / React / TS        │
                   └─────────────┬───────────────┘
                                 │
                     REST/HTTPS  │  WebSocket
                    ┌────────────┴─────────────┐
                    │                          │
                    ▼                          ▼
          ┌─────────────────┐       ┌─────────────────────┐
          │ NestJS REST API │       │ Realtime Gateway    │
          │ Auth/Orders/... │       │ subscriptions       │
          └────────┬────────┘       └──────────┬──────────┘
                   │                           │
                   │                           │ normalized events
                   ▼                           ▼
          ┌─────────────────┐       ┌─────────────────────┐
          │   PostgreSQL    │       │ Market Provider     │
          │ business state  │       │ Adapter             │
          └─────────────────┘       └──────────┬──────────┘
                                               │ WebSocket/REST
                                               ▼
                                      ┌───────────────────┐
                                      │ External Exchange │
                                      │ public market data│
                                      └───────────────────┘
```

## 2. Architectural boundaries

### Frontend

Responsible for:

- Presentation.
- User interaction.
- Local form validation.
- Realtime subscription requests.
- Realtime view-model state.
- Optimistic UX only where safe.

Not authoritative for:

- Wallet balances.
- Execution price.
- Order status transitions.
- P&L persistence.

### REST API

Responsible for:

- Authentication/session.
- Account initialization.
- Portfolio snapshots.
- Order commands/history.
- Watchlist.
- Historical/business persistence.

### Realtime gateway

Responsible for:

- Maintaining upstream market connection(s).
- Provider heartbeat/reconnect.
- Normalizing provider payloads.
- Maintaining latest in-memory market state required for broadcast/order triggering.
- Client subscribe/unsubscribe.
- Broadcasting only relevant streams.

### Order engine

Responsible for:

- Validate authoritative balances.
- Reserve/release locked funds.
- Create/fill/cancel orders.
- Update balances/positions/trades transactionally.
- Consume trusted latest market price for market/limit execution.

The order engine may begin inside the NestJS API process as a module/service. Do not split it into a microservice in MVP.

## 3. Market data flow

```text
Exchange WebSocket
      │
      ▼
Provider Adapter
      │ parse provider payload
      ▼
Normalizer
      │ internal event contract
      ├──────────────► Latest Market Cache
      │
      ├──────────────► Pending Order Evaluator
      │
      └──────────────► Client Realtime Gateway
                              │
                              ▼
                           Browser
```

Provider-specific payloads must stop at the adapter/normalizer boundary.

## 4. REST vs realtime responsibility

### REST examples

- `POST /auth/register`
- `POST /auth/login`
- `GET /me`
- `GET /portfolio`
- `GET /orders`
- `POST /orders`
- `POST /orders/:id/cancel`
- `GET /watchlist`

### WebSocket examples

- ticker update.
- candle update.
- order-book snapshot/delta.
- recent trade batch.
- connection/stale signals.

Do not implement live price by polling REST every second.

## 5. Initial page data flow

Example `/trade/BTC-USD`:

1. Route validates supported symbol.
2. Page shell renders.
3. Historical candles are loaded via REST/provider-backed API.
4. Browser opens/reuses application WebSocket.
5. Browser subscribes to BTC-USD ticker/candle/orderbook/trades channels.
6. Gateway sends current snapshots where required.
7. Gateway sends incremental events.
8. When route changes to ETH-USD, frontend unsubscribes BTC-USD and subscribes ETH-USD.

## 6. One client WebSocket per browser session

Preferred frontend model:

- One managed socket connection.
- Multiple logical subscriptions over that connection.
- Reference-count or route-managed subscriptions.

Avoid:

- One socket per component.
- Chart opening a socket, order book opening another socket, ticker opening another socket.

## 7. Provider reconnect architecture

The backend must distinguish:

- Upstream exchange connection state.
- Downstream browser connection state.

If upstream disconnects:

1. Mark market stream stale.
2. Notify browsers.
3. Reconnect with bounded backoff.
4. Re-subscribe required upstream channels.
5. Rebuild snapshot-dependent state such as order book.
6. Resume normal updates.

## 8. Order engine interaction with market stream

Pending LIMIT orders should not depend on a browser being online.

```text
Market ticker event
      │
      ▼
PendingOrderEvaluator
      │
      ├─ BUY where market <= limit
      └─ SELL where market >= limit
             │
             ▼
         fillOrder()
             │
             ▼
     PostgreSQL transaction
```

The browser is a viewer/command client, not the order execution engine.

## 9. Scalability path

### MVP

- Single NestJS process.
- In-memory current market cache.
- PostgreSQL persistent business state.

### Later

If multiple backend instances are needed:

- Redis current-price cache.
- Redis pub/sub or another message bus for realtime fan-out.
- Distributed pending-order coordination.

Do not solve this before it is needed.
