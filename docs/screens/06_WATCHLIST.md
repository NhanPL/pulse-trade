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

- [x] Protected route.
- [x] Persisted symbols load.
- [x] Prices update live.
- [x] Remove persists.
- [x] Reload preserves result.
- [ ] Empty state links to markets.

## 9. N03 implementation notes

- `/watchlist` uses the existing protected-route/session boundary. Session checks
  complete before private REST requests or ticker subscriptions start. Expired
  watchlist reads hide the list and offer sign-in with `/watchlist` as the return route.
- The page, Market Overview stars and remove controls share the existing
  account-scoped TanStack Query cache. Confirmed DELETE responses update membership
  and reconcile from REST; failed/pending removals retain the row and prevent
  duplicate submissions. Temporary refetch errors keep last-known quotes visible.
- Desktop follows `docs/design/desktop/watchlist.png`'s heading, Explore Markets,
  Total Watched/Top Mover summary and table hierarchy. Tablet uses two-column cards;
  small mobile uses single-column cards with visible field labels and remove actions.
- The written ticker-only requirement takes precedence over the evidence's Trend
  column: no fabricated sparklines or candle subscriptions are added. The existing
  supported-market set is unchanged. Volume is the normalized base-asset 24h
  quantity, labeled with its asset, not an invented USD turnover.
- Each market row observes only its symbol's ticker/freshness. Summary/footer
  selectors return primitives to avoid updates for unrelated or price-only ticks.
  Top Mover is the highest signed 24h change among saved markets and is withheld
  while any saved quote is missing/stale or the connection is unavailable.
- The page owns ticker-only subscriptions for unique supported saved symbols.
  Unchanged REST lists do not churn subscriptions; removal, route departure,
  authentication expiry and logout release them. Reconnection re-subscribes through
  the shared manager. Browser testing uncovered an existing timer-receiver error;
  binding default client timers to `globalThis` fixes reconnect without changing
  the subscription architecture.
- N03 supplies a minimal no-saved-markets message and keeps Explore Markets
  available; an initially empty list opens no market socket. N05's complete guided
  empty-state design remains a separate backlog task.
- Coverage: watchlist presentation/selector and subscription lifecycle unit tests;
  browser tests for session gating, loading, live prices, mutation errors, pending
  removal, REST retry/expiry, stale/reconnect recovery, cleanup, keyboard controls,
  and desktop/tablet/320px mobile layouts.

## 10. N04 persistence acceptance

Persistence is server-owned: N01's PostgreSQL records, N02's confirmed mutations
and N03's account-scoped REST query already implement the required behavior.
N04 adds reload-focused regression coverage rather than a second persistence
store or a new API/schema. Neither the watchlist nor authentication credentials
are serialized into `localStorage`/`sessionStorage`.

On a fresh document:

1. Restore authentication through the existing HttpOnly refresh cookie.
2. Verify the current identity with `/me`, keeping private content gated.
3. Fetch `GET /watchlist` with the restored in-memory bearer token and `no-store`.
4. Render server-confirmed symbols and subscribe only to their tickers.

`watchlist-persistence.spec.ts` covers confirmed Market Overview saves, removals,
hard reloads of both routes on desktop/320px mobile, a fresh tab, logout/login and
account isolation, delayed session/REST recovery, expired sessions, retry after a
reload-time REST failure, and failed writes not becoming persisted changes.
Reloads do not replay POST/DELETE requests or reuse the previous document's bearer
token; restored ticker subscriptions match the newly fetched shortlist.

The PostgreSQL watchlist integration suite also initializes an independent
Nest/Prisma instance, rotates the existing refresh cookie and reads the same saved
item identity/time. Previously removed symbols stay absent, duplicate adds still
return the same item, and later removals are visible from both instances without
affecting another account or paper-trading balances.

Cross-tab instant synchronization and the guided empty-state UI are not added by
N04. A fresh/reloaded tab reads the latest server list; an existing mounted tab
continues using the established query lifecycle.
