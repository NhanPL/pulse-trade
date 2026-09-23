# Screen 04 — Portfolio

Route: `/portfolio`

Access: Authenticated.

## 1. Goal

Show the result of paper trading and demonstrate combining persistent server data with live market prices.

## 2. Desktop layout

```text
Portfolio
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Total Value│ │ Unrealized │ │ Realized   │
│ $...       │ │ +$...      │ │ +$...      │
└────────────┘ └────────────┘ └────────────┘

Balances
USD Available | USD Locked

Holdings
Asset | Qty | Avg Cost | Current | Value | Unrealized P&L
BTC   | ...
ETH   | ...
```

## 3. Mobile layout

- Summary cards horizontally scroll only if necessary; preferable stacked/2-column responsive grid.
- Holdings switch to compact cards if table becomes unreadable.

## 4. Component tree

```text
PortfolioPage
├─ PortfolioSummary
│  ├─ TotalValueCard
│  ├─ UnrealizedPnlCard
│  └─ RealizedPnlCard
├─ BalancePanel
│  └─ AssetBalanceRow[]
├─ HoldingsSection
│  ├─ HoldingsTable/Desktop
│  └─ HoldingCardList/Mobile
└─ PortfolioState
   ├─ Skeleton
   ├─ EmptyPortfolio
   └─ ErrorState
```

### K02 summary presentation

The summary follows the four-card row in `docs/design/desktop/portfolio.png`: Total Value,
Unrealized P&L, Realized P&L, and Cash Balance. The cash card supplements the three core cards
above; the available/locked balances panel remains K03.

At K02, `/portfolio` is authenticated and explicitly labeled as a sample portfolio. Separate
fixtures supply illustrative USD values to presentational components, following the screen
build order in `docs/10_DEVELOPMENT_PLAN.md`. REST/live valuation and realized-P&L aggregation
remain subsequent tasks (K05–K07). Sample values must never be presented as account data.
Do not add historical sparklines or percentage returns without the data to support them.

### K03 balances presentation

The USD panel below the summary shows Available, Locked, Total, and the available share,
following the desktop evidence. It uses the same explicitly labeled sample portfolio as K02.
Total is calculated from the decimal inputs before display rounding; percentages describe
the split of USD cash, not portfolio performance. Zero cash has no allocation and unavailable
inputs must not appear as zero balances. The layout stacks on narrow screens.

This step covers the USD breakdown documented by the screen and existing `/portfolio` contract.
The broader per-asset balance requirement remains: `positions.quantity` alone cannot supply
crypto available/locked balances. K03 does not extend that API or implement reservations.

### K04 holdings presentation

The holdings panel follows `docs/design/desktop/portfolio.png`: desktop uses a six-metric table
with allocation bars and a portfolio totals footer, while narrower layouts use readable cards.
Search and the small-balance switch are local presentation controls with keyboard-accessible
semantics. Each holding also links to its public trading workspace.

K04 continues to use the page's explicitly labeled sample portfolio. The fixture supplies
presentation-ready quantity, cost, price, value, and P&L strings so this step does not imply
live account valuation. Combining the authenticated position snapshot with tickers, calculating
live unrealized P&L, and presenting stale/empty/loading states remain K05, K06, and K08.

### K05 account snapshot and live prices

The portfolio now fetches the authenticated `/portfolio` snapshot through TanStack Query. Cash,
nonzero quantities, and average cost come from that response; the K02–K04 fixtures are no longer
shown as account data. The response is runtime-validated with the shared contract and remains in
the private `portfolio` query scope so logout removes it.

After the snapshot loads, the page creates one ticker-only subscription containing exactly the
held `ASSET-USD` symbols. The shared realtime manager owns reconnect and re-subscription, while
route unmount or a changed position set releases the old subscription and store bindings. Each
holding row selects only its own ticker. Aggregate selectors return stable primitive values so an
unrelated ticker does not rerender the portfolio, and allocation labels update independently from
the rest of each row.

Current price, 24-hour change, position market value, total holdings value, and total portfolio
value update from the ticker store without refetching `/portfolio`. Decimal multiplication and
cash aggregation use scaled integers. "Hide Small Balances" treats a live position below $10 as
small. Unrealized and realized P&L intentionally remain unavailable until K06 and K07; richer
empty/loading/stale valuation presentation remains K08.

### K06 live unrealized P&L

Each holding now derives its unrealized amount from `(current price - average cost) × quantity`
and its percentage from that amount divided by the position cost basis. The summary and holdings
footer aggregate the same amounts and divide by the combined cost basis, rather than averaging
position percentages. Gains include `+`, losses include `-`, and break-even values remain neutral,
so meaning never depends on color alone.

All calculations use scaled integers and round only for presentation. Missing required tickers keep
the affected and aggregate values unavailable. Relevant ticker events update the holding, footer,
and summary through narrow Zustand selectors without refetching `/portfolio`. Persisted realized
P&L remains unavailable until K07; stale and partial valuation messaging remains K08.

### K07 realized P&L

The Realized P&L summary card aggregates the authoritative `realizedPnl` strings from every
position in the authenticated `/portfolio` snapshot. Closed positions remain part of this total
even when their zero quantity excludes them from the holdings table. Positive and negative totals
include an explicit sign and matching tone; an account with no trading history shows a neutral
`$0.00`.

Aggregation uses signed scaled integers and does not change when market tickers update. The card
does not invent a realized return percentage because the current API does not provide the required
historical denominator. Order mutations continue to refresh the persisted portfolio snapshot
through the existing query invalidation flow. Stale and richer empty-state presentation remains
K08.

### K08 loading, empty, and valuation freshness states

While the authenticated portfolio snapshot is pending, the page keeps its heading visible and
shows contextual skeletons for the account label, summary cards, cash balances, and holdings. It
does not render fabricated account values or replace the whole route with a generic spinner.

An account with only virtual USD keeps its cash summary and balance details visible, then presents
the documented `No crypto positions yet` state with an `Explore Markets` action. Search, the
small-balance switch, and holdings totals are omitted when there are no crypto positions.

After the snapshot loads, missing required tickers produce a `Waiting for live prices` notice and
leave affected aggregate values unavailable. `market.stale` events and a disconnected/reconnecting
client preserve last-known prices, mark the affected holding and aggregate valuation as `Delayed`,
and explicitly state that delayed values are included in totals. A newer ticker or `market.live`
event clears the symbol-level stale state. Freshness events are ordered by event timestamp so an
older stale notification cannot overwrite a recovered market. None of these realtime states
refetch `/portfolio`.

## 5. Data model

REST provides:

- Available/locked balances.
- Position quantity.
- Average cost.
- Realized P&L.

Realtime provides:

- Current prices by held asset market.

Derived frontend view model:

```text
market value = quantity × current price
unrealized P&L = (current - avg cost) × quantity
```

Backend values remain authoritative for persisted balances/cost basis.

## 6. Realtime subscriptions

Subscribe ticker only for assets required to value current holdings.

Avoid subscribing to order book/trades on this page.

## 7. Stale valuation

If BTC ticker is stale:

- Mark BTC current value as delayed/stale.
- Overall portfolio valuation should indicate that it includes stale data.

Do not silently present an old number as fully live.

## 8. Empty state

If user owns only USD:

```text
No crypto positions yet.
Start paper trading to build your portfolio.
[Explore Markets]
```

## 9. Balance display

Show available and locked separately, especially after limit orders exist.

Example:

```text
USD
Available  $4,000
Locked     $6,000
Total      $10,000
```

## 10. Acceptance criteria

- [ ] Protected route.
- [ ] Total value shown.
- [ ] Available/locked balances shown.
- [ ] Holdings show average cost/current/value/P&L.
- [ ] Current value updates from realtime ticker without refetch every tick.
- [ ] Stale valuation indicated.
- [ ] Empty state useful.
- [ ] Mobile holdings remain readable.
