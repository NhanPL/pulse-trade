# Screen 07 — Shared Layout & Application States

This document covers UI behavior shared across multiple routes.

## 1. App header

Desktop:

```text
Logo | Markets | Portfolio | Orders | Watchlist        Live ● | User
```

Guest:

```text
Logo | Markets                                   Login | Register
```

Mobile:

- Compact logo.
- Menu/navigation trigger or bottom navigation.
- Connection status should remain discoverable.

## 2. Navigation access rules

Public:

- Markets.
- Trade routes.

Authenticated:

- Portfolio.
- Orders.
- Watchlist.

Guest selecting protected navigation:

- Redirect to login.
- Preserve intended destination if possible.

## 3. Global connection status

Status values:

- Live.
- Connecting.
- Reconnecting.
- Delayed/Stale.
- Offline.

Do not show a full-screen blocking overlay just because market realtime is reconnecting.

Application business pages can continue displaying persistent data.

## 4. Toast policy

Good toast cases:

- Order placed.
- Order cancelled.
- Added/removed watchlist.
- Session expired.

Do not toast every market disconnect if an inline/global connection badge already communicates it and reconnect is automatic.

## 5. Global API errors

Request-specific errors stay near the feature.

Examples:

- Order reject -> OrderForm.
- Portfolio fetch fail -> Portfolio page state.

Unexpected fatal error -> route error boundary.

## 6. Not found

Generic route not found:

- Friendly 404.
- Link Markets/Home.

Unsupported trading symbol gets domain-specific message on the trading route.

## 7. Session expiry

If access request cannot refresh session:

1. Clear private auth state/cache.
2. Redirect to login for protected page.
3. Show one concise session-expired message.
4. Preserve destination where safe.

## 8. Loading shell

Avoid layout shift:

- Header remains stable.
- Page sections reserve approximate height.
- Chart skeleton maintains chart aspect/height.

## 9. Visual semantics

Profit/loss:

- Include `+` or `-`.
- Color is supplemental.

BUY/SELL:

- Use text labels clearly.
- Do not rely on green/red alone.
