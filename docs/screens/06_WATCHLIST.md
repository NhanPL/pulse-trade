# Screen 06 — Watchlist

Route: `/watchlist`

Access: Authenticated.

## 1. Goal

Provide a simple persisted shortlist of markets and another place to demonstrate live ticker subscriptions without unnecessary channels.

## 2. Layout

Similar to a reduced Market Overview screen.

```text
Watchlist
Your saved markets

Symbol | Price | 24h | Volume | Remove
```

## 3. Component tree

```text
WatchlistPage
├─ PageHeading
├─ WatchlistMarketList
│  └─ WatchlistMarketRow[]
│     ├─ MarketIdentity
│     ├─ LiveMarketPrice
│     ├─ Change24h
│     ├─ Volume
│     └─ RemoveButton
└─ WatchlistState
   ├─ Skeleton
   ├─ EmptyState
   └─ ErrorState
```

## 4. Data

REST:

- watchlist symbols.

Realtime:

- ticker only for watchlist symbols.

Do not subscribe to order books/candles/trades here.

## 5. Add workflow

Primary add action may live on:

- Market Overview row.
- Trading header star.

Watchlist page itself may later include an Add Market dialog, but it is not required for MVP.

## 6. Remove workflow

Remove immediately or with lightweight confirmation depending on UX.

Recommended:

- Remove directly.
- Show toast with optional undo only if implementation remains reliable.

## 7. Empty state

```text
Your watchlist is empty.
Save markets from the Markets or Trading page.
[Explore Markets]
```

## 8. Acceptance criteria

- [ ] Protected route.
- [ ] Persisted symbols load.
- [ ] Prices update live.
- [ ] Remove persists.
- [ ] Reload preserves result.
- [ ] Empty state links to markets.
