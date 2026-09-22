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
