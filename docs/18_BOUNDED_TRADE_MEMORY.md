# P03 — Bounded trade memory verification

## Scope and retained-data boundaries

P03 verifies public market-trade retention, not persistent paper-order execution
history. The existing frontend already keeps 50 trades per symbol; this task adds
long-stream, lifecycle and UI evidence rather than replacing that implementation.
No trade cadence, layout, financial transaction, chart rule, dependency or later
backlog feature changes.

Inspection found one missing retention bound: `MarketCacheService` copied the
entire latest provider batch. It did not accumulate batches over time, but its
retained trade count still depended on an arbitrarily large incoming batch.
P03 limits **only this bootstrap cache** to the newest 50 unique trades, with
newest-version deduplication, deterministic ID ordering for equal timestamps and
defensive copies. Existing event freshness/replacement semantics are preserved.

```text
Full normalized provider batch
  ├─ Bootstrap cache: latest batch's newest 50 unique trades per symbol
  ├─ Candle aggregation: every trade; existing bounded dedupe window
  └─ Live WS fan-out: every trade
        └─ Frontend: latest 50 unique trades; 6 collapsed / 50 expanded DOM rows
```

The backend cache is not a newly accumulated 50-trade history: a newer one-item
batch still replaces the previous batch. Candle aggregation and live fan-out use
the original full event, so cache truncation cannot lose volume or live trades.
Financial prices/quantities remain strings and backend wallet logic is unchanged.

| Retained container | Bound | Ownership/lifetime |
|---|---:|---|
| Frontend recent-trade array | 50 per active symbol | Trading route clears its symbol on release |
| Backend bootstrap trade array | 50 per supported symbol | Market cache replaces the latest batch |
| Candle dedupe ID set and eviction queue | 5,000 IDs in each per symbol | Existing candle service window; oldest ID evicted from both |
| Aggregated candles | 4 per symbol | One current candle for each supported interval |
| React trade data rows | 6 collapsed, at most 50 expanded | Existing Recent Trades component; no hidden archive |

The curated provider/gateway market universe currently has five supported symbols.
Backend trade retention therefore has at most 250 cached records for those inputs.
Tests do not claim this service can accept arbitrary unlimited symbols safely;
symbol admission remains the existing provider/gateway responsibility.

## Reproduction

```bash
pnpm --filter @pulse-trade/web test:memory:trades
pnpm --filter @pulse-trade/web test
pnpm --filter @pulse-trade/api test
pnpm --filter @pulse-trade/web test:e2e:realtime
```

The dedicated memory command first uses the existing legacy compilation/test
pipeline, then runs the four new Node scenarios with `--expose-gc`. Ordinary
frontend CI also discovers these scenarios without exposed GC. Only aggregate
counts and optional heap observations are printed; no per-trade payload history,
authenticated account data or diagnostics upload is added.

## Deterministic verification

Subscription ownership is unchanged: `TradingChart`/`useTradingRealtimeSubscription`
acquires the shared manager and reference-counted runtime bindings. Its cleanup
unsubscribes and clears symbol-specific trade state before releasing bindings.
Reconnect reuses those bindings and re-sends only active subscriptions; changing
symbol releases the previous owner. No Recent Trades component opens a socket.

- Frontend: 100,000 synthetic trades in 1,000 batches pass the **actual shared
  schema, event router, store bindings and subscription manager**. After every
  batch the retained array has exactly the newest 50 unique trades and one symbol
  key; checkpoints at 10,000, 50,000 and 100,000 all retain 50.
- Replay/obsolete/empty batches keep the same array reference. Older versions of
  an existing ID cannot overwrite it; an equal-time correction replaces its
  values without increasing the count. A malformed mixed batch is rejected as
  a whole, without retaining its otherwise-valid sibling trade.
- 100 synthetic reconnect cycles retain last-known data, re-subscribe exactly
  once per recovery, and keep one message listener, two connection listeners
  (manager + binding), four store event listeners and one logical subscription.
- 200 route changes across all five symbols clear the old array before acquiring
  the next one. Overlapping BTC/ETH owners share bindings; releasing BTC preserves
  ETH's reference, and the final release leaves zero store listeners and arrays.
  Destroying the runtime removes the remaining manager/message listeners.
- Backend: 100,000 trades in 100 batches retain 50 cached trades, 5,000 dedupe
  IDs, a 5,000-entry eviction queue and four candles at all three checkpoints.
  The one-hour candle volume is exactly `100000`, proving all source trades were
  processed despite the 50-record cache limit. Expired IDs leave the set and
  recent replay IDs are still rejected.
- Backend tests also cover all five symbols, batch replacement, stale rejection,
  empty/unknown state, timestamp ties, newest duplicate versions, input/output
  mutation isolation and idempotent provider-listener shutdown. A separate
  200-trade case still maps all 200 live trades and includes all 200 in candles.
- RTL checks six/fifty DOM row bounds across ongoing updates, keyboard expansion
  and collapse, no commits for unrelated symbols/replay, finite Snapshot fallback
  after clearing and the next symbol's data.
- Desktop/mobile browser scenarios send and count all 10,000 trades through the
  actual Nest gateway and WebSocket, verify 50 expanded / six collapsed data rows,
  retain the newest values through reconnect/replay and release subscriptions on
  exit. No socket/REST interception or browser store injection is used.

Node tests inspect existing backend private containers solely to assert retained
cardinality; there are no production metrics getters or long-lived probe arrays.

## Local GC observations and limits

Two Windows / Node 24.14.1 runs on 2026-10-08 produced the same retained counts.
Frontend process `heapUsed` after explicit GC was:

| Trades processed | Run 1 bytes | Run 2 bytes | Retained trades |
|---:|---:|---:|---:|
| 10,000 | 10,888,256 | 10,889,312 | 50 |
| 50,000 | 10,903,000 | 10,903,624 | 50 |
| 100,000 | 10,935,440 | 10,954,688 | 50 |

These are observations, not a heap/FPS SLA or proof about the entire application.
The deterministic pass/fail assertions are retained item/container counts and
cleanup. VM/JIT/GC behavior, string lengths and test instrumentation affect bytes;
CI deliberately has no heap-percentage threshold. Parsed payloads, temporary
deduplication maps/sorts and WebSocket transport queues are not the retained
buffers and can scale with an individual incoming batch. This task does not add
transport backpressure or a message-byte security limit.

The candle ID window remains 5,000, not lifetime deduplication: an ID evicted from
that existing window is no longer tracked. Reconnect tests cover recent replay;
no candle aggregation semantics are changed by P03.

## Local validation (2026-10-08)

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm build` passed.
- `pnpm --filter @pulse-trade/web test`: 110 Node tests + 39 Vitest/component
  tests passed; P03 adds four Node and three component scenarios.
- `pnpm --filter @pulse-trade/api test`: all 163 tests passed, including the five
  new cache/candle-memory scenarios. Those five were rerun after final self-review.
- `pnpm --filter @pulse-trade/web test:e2e`: all 140 Chromium UI tests passed,
  including existing desktop/mobile accessibility and keyboard checks.
- `pnpm --filter @pulse-trade/web test:e2e:realtime`: all five scenarios passed,
  including the two new real-socket soak cases and the final 10,000-trade counters.
- The dedicated exposed-GC command passed and emitted the aggregate observations
  above. No existing test was deleted, skipped or weakened.

PostgreSQL integration tests were not run locally: this task changes no database
or wallet behavior. The unchanged GitHub workflow runs them and the full-stack
account/trading E2E tests in addition to this verification coverage.
