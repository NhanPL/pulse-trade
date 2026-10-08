# P01 — Ticker render profile

This is the historical P01 baseline. [P02](17_ORDER_BOOK_PRESENTATION.md) deploys
the scoped book presentation optimization; the current ticker harness now flushes
the coalesced book burst and asserts its improved book/grid counts. The original
measurements below remain unchanged for comparison.

## Scope and reproduction

P01 measures the current ticker render boundaries. It does not change production
selectors, order-book cadence (P02), trade retention (P03), financial calculations,
subscriptions or visual layouts. No dependencies, production profiling build,
debug endpoint or diagnostic uploads are introduced.

From the repository root:

```bash
pnpm --filter @pulse-trade/web test:profile:ticker
# Includes the collector tests and the rest of the frontend regression suite:
pnpm --filter @pulse-trade/web test
```

The focused command prints synthetic aggregate JSON measurements and fails on
render-scope regressions. The normal Vitest command/CI discovers the same tests
automatically. No authenticated payload, credential, cookie or per-tick trace is
printed or persisted.

## Method and interpretation

The harness lives in `apps/web/src/test/profiling/`. It runs the existing React
components, real TanStack Query observers, real Zustand selectors, shared runtime
event validation, `RealtimeEventRouter` and ticker/candle store bindings. Query
snapshots are contract-validated synthetic fixtures. A settled authenticated
session and subscription hooks are stubbed; the transport is an in-process message
source, not a browser WebSocket. Unexpected REST calls fail the tests.

Trading uses the same header/grid/panel composition as the route, at the initial
1m timeframe. Only the Lightweight Charts renderer and ResizeObserver are stubbed
for jsdom; `CandlestickChart` and its query/store integration remain real. The
async Next server route, app providers and network lifecycle are outside this
measurement. Actual socket reconnect, re-subscription, timeframe changes and route
cleanup remain covered by the existing O07 real-WebSocket E2E suite.
Responsive desktop/mobile markup is mounted together in jsdom; CSS visibility and
viewport layout are not profiled. Browser regressions are checked separately.

Trading panels start with a validated live book snapshot (20 levels per side)
and one recent trade, not their static fallback previews. Initial book publication
is flushed before the counters reset; the workload changes only tickers, not book
deltas or trades, and does not measure/alter their ingestion or presentation cadence.

Each workload seeds BTC at $50,000 and ETH at $3,000, settles mount/query/form
effects, then resets the counters. It sends 100 validated events in **100 separate
`act` calls**, with increasing event/market timestamps. BTC price advances by $1
per event; 24h change, volume and freshness remain unchanged. This is a controlled
commit workload, not a 100Hz feed or an FPS benchmark. A synchronous burst would
be batched by React and would not answer the same isolation question.

The collector reports:

- `commits`: update/nested-update Profiler callbacks for the named **subtree**;
  mounts are excluded. A child's update can produce a parent Profiler callback
  without calling the parent component function.
- `functionCalls`: direct calls to selected non-memo component implementations,
  through test-only forwarding delegates. Probes are verified active at mount.
  `null` means this function was not instrumented, not zero renders.
- `totalActualMs` / `maxActualMs`: aggregate/max React `actualDuration`.
- `lastBaseMs`: the final callback's React `baseDuration` estimate.

These timings include development React, jsdom and instrumentation overhead. They
exclude browser layout, paint, chart canvas/GPU work and production network
latency. Nested durations overlap and must **not** be summed together. Timing
values are observations, not CI thresholds or performance SLAs. The assertions
use deterministic counts, visible final values and absence of REST requests.
This follows the semantics of React's [Profiler documentation](https://react.dev/reference/react/Profiler).

## Measured baseline

Measured twice on 2026-10-08, Windows, Node 24.14.1, pnpm 11.24.0, React 19.2.8,
Vitest 5.0.3/jsdom 29.1.1, based on O08 commit `c53d57f`. Counts matched in both
standalone runs. Durations below are illustrative local measurements only.

### 100 changing BTC ticker events

| Boundary | Subtree update commits | Container function calls | Total actual ms, run A / B |
|---|---:|---:|---:|
| AppHeader / shell tree | 0 | 0 | 0 / 0 |
| TradingMarketHeader tree | 100 | 0 | 3.461 / 2.814 |
| TradingHeaderPrice BTC | 100 | not probed | 3.292 / 2.633 |
| TradingGrid tree | 100 | 0 | 219.652 / 212.047 |
| OrderBook | 100 | not probed | 219.531 / 211.942 |
| ChartPanel tree | 0 | 0 | 0 / 0 |
| RecentTrades | 0 | not probed | 0 / 0 |
| OrderForm | 0 | 0 | 0 / 0 |
| WatchlistDashboard tree | 100 | 0 | 12.847 / 11.480 |
| WatchlistMarketRow BTC | 100 | not probed | 12.675 / 11.351 |
| WatchlistMarketRow ETH | 0 | not probed | 0 / 0 |
| WatchlistSummary / market status | 0 | not probed | 0 / 0 |
| PortfolioDashboard tree | 100 | 0 | 47.143 / 46.513 |
| PortfolioSummary | 100 | not probed | 8.799 / 8.703 |
| HoldingsSection tree | 100 | 0 | 32.399 / 31.982 |
| BalancePanel | 0 | 0 | 0 / 0 |

The shell, grid, form and cash container are isolated from price-only changes.
The focused quantity field retains its input and focus. Watchlist ETH stays
untouched. Portfolio totals and held-asset valuations correctly update, with no
portfolio refetch: final total $13,505.00, unrealized -$495.00, realized +$100.00,
cash $5,000.00. Another holding's allocation can legitimately change when BTC
changes the combined holdings denominator; it is not an unrelated-price leak.

OrderBook is the largest measured trading subtree in this particular workload.
It reads the entire symbol ticker for the mid-price and rebuilds display rows on
each accepted ticker. This is evidence for subsequent investigation, not proof of
a production frame-rate bottleneck or a P02 cadence change.

### Selector controls and same-price updates

| Controlled workload / consumer | Update commits |
|---|---:|
| 100 BTC price changes → test-only broad BTC selector (`state.tickers`) | 100 |
| Same events → test-only broad ETH selector | 100 |
| Same events → deployed per-symbol TradingHeaderPrice BTC | 100 |
| Same events → deployed per-symbol TradingHeaderPrice ETH | 0 |
| 100 newer BTC timestamps, same $50,000 price → deployed BTC price component | 100 |
| Same-price events → test-only primitive BTC price selector | 0 |
| Same-price events → OrderBook / Watchlist BTC row / HoldingsSection subtree | 100 each |
| Same-price events → PortfolioSummary / Watchlist ETH row | 0 each |

The broad-versus-symbol comparison demonstrates the existing architecture's
benefit: the unrelated ETH price consumer drops from 100 commits to 0. The broad
consumer is a negative control, **not the former production implementation**.

There is still same-symbol object churn: `useTicker(symbol)` returns a ticker
object, replaced when newer metadata arrives even if price is unchanged. The
primitive price control demonstrates a possible 100-to-0 improvement for a
price-only consumer. **This candidate is test-only; P01 does not deploy it.** A
future selector change must preserve the freshness/volume/24h fields each real
widget needs and record a new baseline. The 100-commit assertions characterize
today's implementation, not a requirement to retain unnecessary rendering.

### State, symbol and imperative controls

- 100 unrelated SOL updates produce zero commits in the BTC trading price/book,
  shell, two-symbol Watchlist and BTC/ETH Portfolio subtrees.
- Stale events retain the previous price. A reconnect state change deliberately
  updates the shell once; this is a valid status update, not a ticker render leak.
  A newer ticker recovers freshness. Duplicate/older events create zero subsequent
  price/book commits.
- Changing a mounted price consumer from BTC to ETH stops old-symbol renders;
  the next ETH event still updates it.
- 100 candle events call the real chart integration's imperative `series.update`
  100 times with zero chart React commits. Unmount removes the chart listener;
  a later candle does not call `update`. This does not measure canvas performance.
- Every fixture releases store bindings, router/message listeners and QueryClient
  state on teardown, including after assertion failures.

## Existing requirement gaps found, not implemented in P01

`app/page.tsx` still passes `MARKET_TABLE_MOCK` to `MarketOverview`. Market rows and
`LiveMarketPrice` format static props; the overview has no live ticker subscription.
Its zero ticker-driven commits and unchanged price text are therefore **missing
realtime behavior, not a successful live-table optimization**. The written Markets
requirement is broader than this existing implementation. A follow-up requires
an explicitly scoped feed/row/sort integration task.

Similarly, TradingMarketHeader's 24h statistics and OrderForm's indicative MARKET
price use the route snapshot props, while the header price itself is live. Zero
form renders must not be described as proof of a live indicative-price preview.
Backend price validation/execution remains authoritative. These functional gaps
are recorded, not silently fixed under a profiling task.

## Optional browser follow-up (not performed for this baseline)

Use `pnpm dev`, a synthetic paper account and the React DevTools Profiler in a
local browser. Record after auth/history settle, with render reasons enabled.
Compare `/trade/BTC-USD`, `/watchlist` containing BTC/ETH and `/portfolio` with
those holdings. Examine child flamegraphs and actual component render reasons,
not just ancestor commit presence. Record ordinary ticks, input focus, same-price
updates if observed, symbol/timeframe navigation, disconnect/reconnect and both
desktop/mobile layouts. Keep environment, event count and wall-clock interval
with the observation; exchange traffic is nondeterministic.

Use browser Performance tools separately for scripting/layout/paint and canvas
cost. Development/Strict Mode results are not production results; React profiling
is disabled in normal production builds. No production profiling flag is enabled
by this task. Keep any account-bearing browser traces/screenshots local under the
existing diagnostics-sharing restrictions. No browser FPS or production latency
claim is made by this report.

## Validation

Local checks on 2026-10-08 passed:

- Focused profiling command, repeated: 9 scenarios, consistent counts.
- Full frontend suite: 106 legacy tests plus 25 Vitest tests (including 9 profile
  scenarios and 2 collector tests).
- Browser UI E2E: all 140 desktop/mobile tests.
- Actual WebSocket E2E: all 3 desktop/mobile/reconnect/symbol-cleanup tests.
- Repository lint, strict typecheck, formatting check and normal production build.

The unchanged GitHub CI workflow also discovers the new profile tests and runs
the existing backend, PostgreSQL and full-stack suites. No test exclusions,
weakened existing assertions or production performance certification are added.
