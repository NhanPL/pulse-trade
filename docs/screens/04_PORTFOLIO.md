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
