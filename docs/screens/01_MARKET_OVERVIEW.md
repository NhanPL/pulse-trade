# Screen 01 — Market Overview

Route: `/`

Access: Public.

## 1. Goal

Allow a visitor to understand the product immediately and select a market to inspect.

The screen must visibly demonstrate realtime price updates without overwhelming the user.

## 2. Desktop layout

```text
┌────────────────────────────────────────────────────────────┐
│ Header: Logo | Markets | Portfolio | Orders | Watchlist    │
├────────────────────────────────────────────────────────────┤
│ Market Overview                                            │
│ Live crypto markets                                        │
│                                                            │
│ Search [____________]   Sort [24h Change v]                │
├────────────────────────────────────────────────────────────┤
│ Symbol | Price | 24h | High | Low | Volume | Watch         │
│ BTC    | ...                                                │
│ ETH    | ...                                                │
│ SOL    | ...                                                │
└────────────────────────────────────────────────────────────┘
```

## 3. Mobile layout

Use either compact rows or market cards.

Keep these visible first:

- Symbol.
- Current price.
- 24h change.

Secondary statistics can collapse or move to a detail row.

## 4. Component tree

```text
MarketOverviewPage
├─ PageHeading
├─ MarketToolbar
│  ├─ MarketSearchInput
│  ├─ MarketSortSelect
│  └─ ConnectionStatusBadge
├─ MarketList
│  └─ MarketRow[]
│     ├─ MarketIdentity
│     ├─ LiveMarketPrice
│     ├─ Change24h
│     ├─ MarketStats
│     └─ WatchlistToggle
└─ MarketListState
   ├─ Skeleton
   ├─ EmptySearchState
   └─ ErrorState
```

## 5. Data

Bootstrap REST:

```text
GET /markets
```

Realtime:

- ticker for visible/supported symbols.

Authenticated-only query:

- watchlist, if user logged in.

## 6. Interaction

### Search

- Case-insensitive.
- Debounce is optional because list is tiny.
- Search does not hit backend in MVP.

### Sort

Sort by:

- Symbol.
- Price.
- 24h change.
- Volume.

### Row click

Navigates to:

```text
/trade/BTC-USD
```

Nested watchlist button must not accidentally trigger row navigation.

### Watchlist star

Guest:

- Ask user to sign in or navigate to login.

Authenticated:

- Add/remove persisted watchlist item.

N02 implementation:

- Stars load through one shared, account-scoped TanStack Query request to `GET /watchlist`.
- A filled teal star and `aria-pressed` indicate a saved symbol; the accessible name says Add/Remove.
- Add/remove calls the N01 API and changes membership only after server confirmation.
- Loading, logout and an in-flight change disable the relevant action; failures stay within the Markets panel with refresh/sign-in recovery.
- Guest stars link to `/login?returnTo=%2F`; star clicks do not bubble into navigation.
- The Watch column stays visible at the edge of horizontally scrolling desktop/tablet tables, while mobile cards retain their corner action.
- This does not build `/watchlist` or change existing ticker subscriptions (N03 and later tasks remain separate).

## 7. Realtime behavior

Do not let one price tick cause the entire market table to rerender.

Preferred:

- `MarketRow`/`LiveMarketPrice` subscribes narrowly by symbol.

Optional UI polish:

- Very brief up/down tick highlight without flashing excessively.

## 8. States

### Loading

Show 5–8 skeleton rows.

### REST error

Show retry action and preserve application shell.

### Realtime disconnected

Keep last known data but show `Reconnecting`/`Delayed` status.

### Empty search

Show:

```text
No markets match "abc".
```

## 9. Accessibility

- Table headers semantic on desktop table.
- Sort control has label.
- Watch star has accessible name like `Add BTC-USD to watchlist`.
- Positive/negative change includes sign text.

## 10. Acceptance criteria

- [ ] Public route loads without login.
- [ ] Market rows show required fields.
- [ ] Prices change live.
- [ ] Search works.
- [ ] Sort works.
- [ ] Row navigates to trade route.
- [x] Watchlist action works for authenticated user.
- [ ] Disconnected/stale state is visible.
- [ ] Mobile layout remains usable at narrow width.
