# P02 — Order-book presentation cadence

## Scope and design

P02 optimizes only the frontend Order Book presentation. It keeps the existing
50 ms window (at most 20 scheduled publications per second), snapshot/delta
protocol, top-20 limit, financial string values and route subscription ownership.
It does not change backend broadcasting, public ticker frequency, trade buffers,
other widgets' selectors, trading rules, layouts or the functional gaps recorded
in [P01](16_TICKER_RENDER_PROFILE.md).

P01 measured 100 Order Book commits for 100 BTC tickers, despite the existing
delta batching. The panel subscribed directly to the whole symbol ticker and
rebuilt every display row. P02 removes that bypass instead of increasing the
window or adding a second debouncing layer.

`order-book-store.ts` now:

- Applies every sequential valid delta immediately to the original maps.
- Tracks dirty sides and derives/sorts top levels only at publication, only for
  sides whose raw levels changed. No-op quantity updates do not dirty a side.
- Reuses the previous top-level arrays when their price/quantity strings match.
- Observes accepted ticker **price** changes through one owned Zustand listener
  per existing realtime binding, scheduling only symbols with book models.
- Publishes the latest trusted ticker mid-price with book data in the **same**
  pending window. Timestamp/24h-only changes do not schedule a book publication.
- Preserves the latest wire sequence in the store, while the React hook selects
  only visible fields (asks, bids, mid-price, status) using shallow comparison.

`OrderBook.tsx` memoizes display/depth arrays by side reference, including reversed
ask presentation. Existing memoized rows then stay untouched on price-only or
unchanged-side updates. Best ask, best bid, spread, ordering, depth, accessible
table/scroll area and desktop/mobile styles are unchanged.

Before the first snapshot, the existing `Snapshot` preview remains. A small
`OrderBookMidPrice` boundary reads just the primitive ticker price during this
bootstrap state; it preserves live indicative prices without waking preview rows.
Once a book view exists it uses only the 50 ms presented price, not raw ticker
updates. This bootstrap exception is intentional; the bounded cadence applies
to the live book, not to UI interaction/route clearing or an uninitialized preview.

There is still one pending timer, started by the first dirty event, never restarted
by later events. Continuous traffic therefore cannot starve publication. The
timer runs only while work is pending; it is not polling. Main-thread contention
or background browser timer clamping can delay a publication, so 50 ms is a
presentation policy, not a latency/FPS guarantee.

## Ownership and correctness

1. `TradingChart`/`useTradingRealtimeSubscription` owns the existing backend
   ticker/orderbook/trade subscriptions through the shared subscription manager.
2. `acquireRealtimeStoreBindings` still reference-counts runtime store bindings.
   The book binding owns both its existing router listener and new ticker-store
   listener; its cleanup releases both. No component creates a socket.
3. Trading route/symbol cleanup still clears the symbol's model, derived caches
   and pending presentation entry. Clearing the final pending symbol cancels the
   timer; clearing one symbol does not cancel another symbol's pending update.
4. Reconnect keeps last displayed data and the binding intact. Existing manager
   re-subscription and incoming fresh snapshots rebuild the book. No new reconnect
   mechanism is added.
5. Sequence gaps keep all earlier valid changes, reject the corrupt/subsequent
   deltas and publish `RESYNC_REQUIRED`. A fresh snapshot restores `READY`.
6. Price ingestion/deduplication/order checking stays in the real ticker store;
   the book observes accepted prices rather than reimplementing ticker validation.

No ticker-only book models are allocated for Watchlist/Portfolio symbols. No raw
delta is dropped by throttling, and mutations outside the displayed top 20 remain
in the maps: tests delete better levels and verify the earlier hidden update is
revealed. The displayed price/spread are previews only; backend execution and
wallet arithmetic remain authoritative and unchanged.

## Reproduction and measured comparison

```bash
pnpm --filter @pulse-trade/web test:profile:order-book
pnpm --filter @pulse-trade/web test:profile:ticker
pnpm --filter @pulse-trade/web test
pnpm --filter @pulse-trade/web test:e2e:realtime
```

The new command runs `src/test/profiling/order-book-cadence.test.tsx` against
the actual components, validated event router and stores. Its 11 scenarios use
fake timeout clocks, 20 levels per side and a settled live snapshot. Profiler
`performance.now` remains real; only timeout scheduling is simulated. Test-only
row forwarding probes are verified active at mount and distinguish zero calls
from missing instrumentation. No account payloads or per-event traces are logged.

The P01 ticker harness retains the same 100 separate `act`-committed events and
now explicitly flushes pending book presentation after the burst. This makes the
new store's final visible value measurable without sleeping, rather than hiding
a stale final price. Its shell/chart/form/unrelated-symbol assertions remain;
only book/grid descendant count expectations reflect the deployed improvement.

| Workload | P01 baseline book commits | P02 book commits | P02 unaffected row calls |
|---|---:|---:|---:|
| 100 distinct BTC price events in a burst | 100 | 1 | 0 for all 40 rows |
| 100 same-price/new-timestamp BTC events | 100 | 0 | 0 |
| 100 ticker events, 10 ms apart over a simulated second | not measured | 20 | 0 for all 40 rows |
| 100 sequential bid deltas + 100 ticker events, 10 ms apart | not measured | 20 | 0 for all 20 asks |
| 100 no-op/off-screen deltas with advancing sequences | not measured | 0 | 0 |

P01's burst counts are the historical baseline from commit `0d8cd42`, documented
in `16_TICKER_RENDER_PROFILE.md`; no before-optimization 100Hz measurement is
invented. The timed workloads separately verify the actual deadline and cadence,
not just React's synchronous event batching. Every event still advances the raw
model as appropriate; the mixed stream ends at sequence 101, bid quantity 100
and mid-price $50,100.

Two local runs on 2026-10-08 (Windows, Node 24.14.1, React 19.2.8, Vitest/jsdom)
produced matching commit counts. Aggregate React durations are emitted for local
inspection only: instrumentation, warm-up and machine load affect them. Nested
durations overlap; do not sum them. These are not browser paint/canvas/FPS or
production latency measurements, and no timing threshold is enforced in CI.

## Verification coverage

- Initial snapshot, correct sorting/top N, empty/deleted levels and retained
  intermediate updates.
- 49 ms without publication, publication at 50 ms, burst coalescing and sustained
  mixed traffic without debounce starvation.
- Same-price metadata, no-op/off-screen deltas, stable side/row references and
  unchanged-side memoization, with live final-price assertions.
- Gap/resync/rebuild, stale price retention, duplicate/older ticker rejection.
- Multi-symbol shared timer, route cleanup without resurrection, no ticker-only
  models and removal of the ticker listener independent of wire-listener cleanup.
- Preview-to-live transition with an independently updated bootstrap mid-price.
- Existing real-socket desktop/mobile E2E now also checks presented book mid-price
  after recovery/reconnect and symbol navigation; no REST/WS interception is added.

The normal frontend/CI Vitest command discovers these tests automatically. No
existing test is deleted, skipped or relaxed to suppress a failure. P01's numeric
baseline remains historical evidence; its updated assertions require the measured
P02 improvement and still verify the other independent widgets.

### Local validation (2026-10-08)

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` and `pnpm build` passed.
- `pnpm --filter @pulse-trade/web test`: 106 legacy tests and 36 Vitest tests
  passed, including all 11 new cadence scenarios and the 9 ticker profiles.
- `pnpm --filter @pulse-trade/web test:e2e`: all 140 Chromium UI tests passed,
  including desktop/mobile accessibility, keyboard and layout checks.
- `pnpm --filter @pulse-trade/web test:e2e:realtime`: all 3 actual-WebSocket
  scenarios passed, including the added presented-price assertions.

PostgreSQL integration tests were not run locally for this frontend-only task;
the unchanged GitHub CI workflow runs them alongside the full-stack E2E suite.
No backend files, dependencies or deployment settings changed for P02.
