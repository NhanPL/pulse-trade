# 06 — REST API Design

## 1. API principles

Base prefix:

```text
/api/v1
```

Rules:

- JSON request/response.
- Consistent error envelope.
- Backend authoritative for financial calculations.
- Decimal financial values serialized as strings.
- Authenticated endpoint derives user identity from session/token, never request body `userId`.
- Zod/shared contract validation at boundaries where practical.

## 2. Success envelope

Simple resources may be returned directly. If an envelope is used, use it consistently.

Recommended:

```json
{
  "data": {}
}
```

## 3. Error envelope

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient USD balance.",
    "details": null,
    "requestId": "..."
  }
}
```

Frontend behavior should use stable `code`, not string matching on `message`.

## 4. Authentication

### POST `/auth/register`

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com"
    }
  }
}
```

Side effects:

- Account created.
- USD 10,000 virtual balance created.
- Session may be created immediately depending on UX decision.

I03 behavior: `201` returns only `data.user.id` and normalized `data.user.email`.
Email is trimmed and lowercased. Passwords must contain 8–128 characters and are
hashed using I02 Argon2id without trimming. Unknown fields (including client-provided
funding amounts or user IDs) are rejected. Confirmation is a frontend field.
User creation and the single USD wallet allocation (`available=10000`, `locked=0`)
commit in one transaction. A duplicate/retried normalized email returns `409`
with `EMAIL_ALREADY_REGISTERED`; it never adds funding. Invalid input returns `400`
with `INVALID_REGISTRATION`; unavailable storage/hashing returns `503` with
`REGISTRATION_UNAVAILABLE`. Errors contain no passwords or internal database details.
Registration does not yet create a session; the subsequent UI should show success
and direct the user to login when that flow is implemented.

### POST `/auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response returns user/session metadata; refresh credential should be handled using secure cookie strategy.

I04 behavior: validates a strict email/password body, normalizes email, and keeps
password unchanged (required, maximum 128 characters). Success is `200`:

```json
{
  "data": {
    "user": { "id": "uuid", "email": "user@example.com" },
    "accessToken": "signed-jwt",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "session": { "id": "uuid", "expiresAt": "ISO-8601 timestamp" }
  }
}
```

The access JWT uses HS256, issuer `pulse-trade-api`, audience `pulse-trade-web`,
`sub` = user ID and `sid` = session ID. It expires after 15 minutes. The random
256-bit refresh credential is sent only in `pulse_trade_refresh`, a host-only
HttpOnly cookie with `Path=/api/v1/auth`, `SameSite=Lax`, a 7-day Max-Age and
`Secure` in production. Only its SHA-256 hash is stored in `sessions`; passwords
still use Argon2id. Login does not create or modify wallet balances.

Invalid input returns `400 INVALID_LOGIN`. Unknown email and incorrect password
both return `401 INVALID_CREDENTIALS` with the same message. Database/signing
failures return sanitized `503 LOGIN_UNAVAILABLE` without issuing a cookie.
Browser requests with an Origin different from `WEB_ORIGIN` return
`403 ORIGIN_NOT_ALLOWED`; requests without Origin remain supported for CLI clients.
Responses use `Cache-Control: no-store`. Credentialed CORS permits the configured
web origin. Browser callers must use `credentials: "include"`.

Set a random `JWT_ACCESS_SECRET` of at least 32 characters in the API process
environment. Missing configuration leaves public data and registration usable
but prevents successful login. Keep access tokens in memory on the frontend.
Refresh rotation, logout and `/me` are implemented below. Other protected endpoints
must apply the same session-aware authentication when their tasks are implemented.

### POST `/auth/refresh`

Rotates/renews access authentication based on refresh/session cookie.

I05 accepts no body or `{}` and authenticates only using `pulse_trade_refresh`.
JSON identity/token fields are rejected with `400 INVALID_REFRESH`. Cookie
credentials must match the 43-character base64url format issued by login;
missing, malformed, duplicate, unknown, expired, revoked or already-used
credentials return `401 INVALID_SESSION`. Browser Origin must match `WEB_ORIGIN`,
using the same policy as login (`403 ORIGIN_NOT_ALLOWED` otherwise).

Success returns `200` with the same user/access-token/session response shape as
login and sets a new HttpOnly refresh cookie. The session ID and original
7-day absolute expiry stay unchanged. Refresh updates `last_used_at` and replaces
the stored credential hash; no raw credential enters JSON or storage. Access
tokens expire in at most 900 seconds, capped by remaining session lifetime.
The cookie Max-Age is also capped to that remaining lifetime. Each access JWT
has a random `jti`, including when issuance happens within the same second.

Rotation performs a conditional update on the old hash, unrevoked state and
expiry inside a transaction. Two concurrent requests with one credential cannot
both succeed: the loser receives `401`. Replaying an old credential does not
revoke the new one. Clients should serialize refresh requests. No error response
sets or clears the cookie, so a late failure cannot erase another request's
successful rotation. Database/signing failures return `503 REFRESH_UNAVAILABLE`;
failed transactions preserve the old hash. Responses use `Cache-Control: no-store`.

There is no grace period for old credentials or historical token-family tracking.
If the server commits a rotation but the browser loses the successful response,
the old cookie cannot refresh again; the user must log in again. Previously issued
access JWTs remain cryptographically valid until their expiry; `/me` additionally
checks live session state as described below.

### POST `/auth/logout`

Revokes current session and clears cookie.

I06 accepts no body or `{}`. Success returns `204` with no response body and
`Cache-Control: no-store`. The refresh cookie is expired using the same name,
host-only domain, path, HttpOnly, SameSite and production Secure flags as login.
Body identity fields return `400 INVALID_LOGOUT`; untrusted browser Origin returns
`403 ORIGIN_NOT_ALLOWED`, following the login/refresh origin policy.

Clients should send the current access JWT in `Authorization: Bearer ...` as well
as the cookie (`credentials: "include"`). The server verifies signature, HS256,
issuer, audience, type, expiry and required claims before using `sid`/`sub` to
identify the session. A valid bearer takes precedence over the cookie. If it is
missing or invalid/expired, the server falls back to the current refresh-cookie
hash. No client-provided session/user ID is trusted.

Logout sets `revoked_at` only when still null, preserving the first revocation
timestamp. It revokes only the identified session, not other devices/sessions,
and never modifies wallets. Repeated logout, missing/unknown/malformed credentials,
and already-revoked sessions return the same `204` and expire the cookie.
Expired sessions are also revoked when their cookie still identifies them.
Storage failures return sanitized `503 LOGOUT_UNAVAILABLE` and keep the cookie so
the client can retry; the API does not falsely report successful revocation.

Revocation targets the stable session ID after credential validation, so rotation
after cookie lookup cannot evade logout. Sending a valid access JWT also lets
logout find the session when rotation already replaced the cookie hash. A stale
cookie alone can no longer identify that session; serialize refresh/logout in
the client and include the access JWT. A late refresh response may restore an
unusable cookie, but a revoked session cannot refresh again.

Logout does not erase a JWT already held by a client: signed access tokens remain
cryptographically valid until expiry. `/me` checks session revocation on every
request; future protected endpoints must do so as well. Frontend token/private-query cleanup belongs to
I11; this endpoint does not implement that UI behavior.

### GET `/me`

Returns current authenticated user.

I07 implements `GET /api/v1/me` (not `/auth/me`). The request must include
`Authorization: Bearer <accessToken>`. Success returns `200`:

```json
{
  "data": {
    "user": { "id": "uuid", "email": "user@example.com" }
  }
}
```

Only the persisted user's ID and email are selected and returned. Password/token
hashes, session metadata and financial balances are not included. The endpoint
does not update session timestamps, rotate credentials, or set cookies.
All responses use `Cache-Control: no-store`.

`CurrentUserService` verifies the access JWT's signature, HS256 algorithm, issuer,
audience, JWT type, expiry and required claims, including UUID-shaped `sub`/`sid`.
It then requires a database session matching both signed identifiers, with no
revocation and an expiry in the future, and returns its associated user. Logout
therefore makes existing access tokens fail `/me` immediately even if their JWT
expiry has not been reached. Refresh may issue a new access JWT for the same active
session; earlier unexpired JWTs for that session continue working until revocation.

Missing/malformed/invalid/expired access tokens, nonexistent sessions/users, an
expired/revoked session or mismatched session owner all return
`401 UNAUTHENTICATED` with the same generic message. Database or verification
configuration failures return sanitized `503 AUTH_UNAVAILABLE`. Refresh cookies
and query-string identity fields never authenticate the request. Clients bootstrap
from their HttpOnly cookie through `/auth/refresh`, then call `/me` with the returned
access token. I10 implements that frontend sequence with one serialized refresh at
startup, validates both shared response schemas and requires the `/me` identity to
match the refresh response. It retains the access token only in memory, refreshes it
before expiry, and never stores it or a refresh credential in browser storage. An
unauthenticated refresh or `/me` response clears the in-memory identity; transient
errors require an explicit retry instead of automatic refresh retries.

## 5. Market REST endpoints

Realtime values are primarily WebSocket driven, but REST is useful for bootstrap/history.

### GET `/markets`

Returns supported market metadata and current snapshot if available.

Example:

```json
{
  "data": [
    {
      "symbol": "BTC-USD",
      "baseAsset": "BTC",
      "quoteAsset": "USD",
      "price": "67542.31",
      "change24hPercent": "2.41",
      "high24h": "68100.00",
      "low24h": "64821.00",
      "volume24h": "...",
      "asOf": "2026-08-27T12:00:00.000Z"
    }
  ]
}
```

### GET `/markets/:symbol/candles?interval=1m&limit=300`

Returns historical OHLC candles needed before realtime updates.

Validation:

- Supported symbol.
- Supported interval.
- Safe bounded limit.

## 6. Portfolio

### GET `/portfolio`

Authenticated.

Response shape:

```json
{
  "data": {
    "quoteCurrency": "USD",
    "cash": {
      "available": "4500.00",
      "locked": "1000.00"
    },
    "positions": [
      {
        "asset": "BTC",
        "quantity": "0.05000000",
        "averageCost": "60000.00",
        "realizedPnl": "100.00"
      }
    ]
  }
}
```

Current market value/unrealized P&L may be returned as a snapshot, but frontend can update display from realtime prices afterwards.

## 7. Orders

### POST `/orders`

Authenticated.

Request MARKET:

```json
{
  "symbol": "BTC-USD",
  "side": "BUY",
  "type": "MARKET",
  "quantity": "0.01000000"
}
```

Request LIMIT:

```json
{
  "symbol": "BTC-USD",
  "side": "BUY",
  "type": "LIMIT",
  "quantity": "0.01000000",
  "limitPrice": "65000.00"
}
```

Optional header P1:

```text
Idempotency-Key: <uuid>
```

Response:

```json
{
  "data": {
    "id": "uuid",
    "status": "FILLED",
    "symbol": "BTC-USD",
    "side": "BUY",
    "type": "MARKET",
    "quantity": "0.01000000",
    "avgFillPrice": "67542.31"
  }
}
```

Common errors:

- `UNAUTHENTICATED`
- `UNSUPPORTED_SYMBOL`
- `INVALID_QUANTITY`
- `INVALID_LIMIT_PRICE`
- `INSUFFICIENT_BALANCE`
- `MARKET_DATA_UNAVAILABLE`
- `MARKET_DATA_STALE`
- `ORDER_CONFLICT`

### POST `/orders/:id/cancel`

Authenticated.

Rules:

- User owns order.
- Order must be PENDING.
- Releases locked funds atomically.

Common errors:

- `ORDER_NOT_FOUND`
- `ORDER_NOT_CANCELLABLE`

### GET `/orders`

Query parameters:

```text
status=PENDING|FILLED|CANCELLED|REJECTED
side=BUY|SELL
symbol=BTC-USD
cursor=...
limit=20
```

Use pagination even if MVP data is small; cursor pagination is preferred for time-ordered history.

### GET `/orders/:id`

Returns order and executions/trades.

## 8. Watchlist

### GET `/watchlist`

Authenticated.

### POST `/watchlist`

Request:

```json
{
  "symbol": "BTC-USD"
}
```

Duplicate add should be idempotent or return stable duplicate error; choose and document one behavior.

Recommended: idempotent success.

### DELETE `/watchlist/:symbol`

Authenticated.

Removing a missing item can return idempotent success.

## 9. Health

### GET `/health`

Returns process/API health.

### GET `/health/market-data` [P1]

Expose high-level market provider connection health, not secrets.

## 10. API cache invalidation mapping

After successful order create/cancel:

Invalidate/refetch or patch:

- `portfolio`
- `orders`

Do not refetch market ticker because market ticker is WebSocket state.
