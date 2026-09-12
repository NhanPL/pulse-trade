# 12 — Security & Deployment

## 1. Security scope

Although this is paper trading, implement normal web security correctly because auth/business state is part of the portfolio demonstration.

## 2. Password security

- Hash passwords with Argon2id or bcrypt.
- Never log passwords.
- Use generic invalid-credential messages.
- Apply reasonable login rate limiting in production.

I02 implementation: `PasswordHashService` in the API `AuthModule` uses asynchronous
Argon2id with 19 MiB memory, 2 iterations, parallelism 1 and a 32-byte hash,
following the [OWASP baseline](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id).
The library generates a fresh random salt and returns an encoded hash containing
the salt and parameters, stored in `users.password_hash`. Passwords are not trimmed,
normalized or truncated. `verify(password, passwordHash)` returns false for a
mismatch, unsupported format or malformed hash, without logging credentials.
Hash-generation errors propagate so callers cannot proceed with an unhashed password.
Registration and login validate their shared request contracts before invoking
hashing/verification. Database access is owned by the shared database module.

## 3. Token/session design

Recommended:

- Short-lived access token.
- Refresh/session credential stored in Secure HttpOnly cookie.
- Server-side session record or hashed refresh credential.
- Refresh rotation/revocation.

Cookie in production should consider:

- `HttpOnly`.
- `Secure`.
- appropriate `SameSite`.
- explicit domain/path behavior.

If web/API are on different sites, test browser cookie/CORS behavior carefully.

I04 implements a 15-minute HS256 access JWT and a 7-day server-side session.
Set `JWT_ACCESS_SECRET` to a randomly generated value of at least 32 characters;
there is no default signing key. Refresh credentials contain 32 random bytes,
are sent only as HttpOnly cookies, and are stored only as SHA-256 hashes. Missing
users still go through password verification against a cached dummy hash; this
reduces the obvious early-return timing difference, not a guarantee of constant
request timing. Invalid-credential responses do not distinguish missing users.

Cookies use `SameSite=Lax`, a host-only domain and `/api/v1/auth` path; production
requires HTTPS for the Secure cookie. Login checks browser Origin against
`WEB_ORIGIN` to prevent login CSRF. Deploy web/API on the same site for this cookie
policy; arbitrary cross-site deployments need a separately reviewed cookie/CSRF
policy. Configure login rate limiting at the production edge before public
deployment; I04 does not introduce a distributed rate limiter.

I05 rotates refresh credentials with a transaction and conditional hash update.
Session expiry is absolute (7 days from login), not extended by refresh. Revoked,
expired and previously consumed credentials cannot rotate. Only the successful
rotation sets a cookie; errors never clear it, avoiding a concurrent-response
race. Session ID remains stable and `last_used_at` records successful use. Access
JWT expiry is capped to session expiry and JWTs have random `jti` identifiers.
The API rejects ambiguous duplicate refresh cookies and checks Origin on refresh
as on login. No token-family replay revocation or grace-window retry is implemented;
a committed rotation whose response is lost requires a fresh login.

I06 revokes the current session before expiring its refresh cookie. It accepts a
verified access JWT (stable session ID) or falls back to the current cookie hash;
unverified claims never identify a session. Supplying the access JWT handles
logout racing a refresh that has already rotated the cookie. All auth mutations
use the same Origin check. Revocation is idempotent and does not affect other
sessions. JWT verification checks signature/algorithm/issuer/audience/type/expiry;
invalid bearer tokens fall back to cookie authentication. Database failures keep
the cookie for retry. I07 checks live session revocation for `/me`; subsequent
protected endpoints must also check `revoked_at`. Logout does not invalidate a
JWT's cryptographic signature.

## 4. Authorization

Backend determines user from authentication context.

Never trust:

```json
{ "userId": "someone-else" }
```

for wallet/order ownership.

Every order/watchlist/portfolio query must scope by authenticated user.

I07's `/me` uses a shared access-token verifier (also used by logout) and validates
UUID-shaped session/user claims before querying PostgreSQL. `CurrentUserService`
requires a session owned by the signed user that is neither expired nor revoked.
It reads only the persisted user's ID/email, never trusts query-string identity,
and does not accept a refresh cookie as an access token. There is no global guard
on public market endpoints. Future private APIs must adopt this session check.

## 5. Validation

Validate on backend even if frontend already validates:

- Supported symbol.
- Side/type enum.
- Quantity.
- Limit price.
- Pagination bounds.
- UUID/identifier shape.

## 6. Market data trust

Order execution must use backend trusted current market state, not a price submitted by the browser.

Bad request design:

```json
{
  "quantity": "0.01",
  "price": "1.00"
}
```

The client may show a price preview, but backend chooses execution price.

## 7. Stale-price safety

Do not execute market orders if latest trusted market price exceeds configured staleness threshold.

Return stable business error:

```text
MARKET_DATA_STALE
```

Pending limit evaluation should also pause while required market stream is stale.

## 8. CORS/CSRF

If refresh/session relies on cookies:

- Configure CORS allowlist explicitly.
- Do not use wildcard origin with credentialed cookies.
- Evaluate CSRF protection for cookie-authenticated state-changing requests.
- A same-site deployment/reverse proxy simplifies the model.

## 9. Secrets

Environment variables may include:

```text
DATABASE_URL
JWT_ACCESS_SECRET
SESSION_SECRET / refresh secret
WEB_ORIGIN
MARKET_PROVIDER_URL
SENTRY_DSN
```

Rules:

- `.env` ignored from git.
- `.env.example` contains names, not real secrets.
- Validate environment variables at startup.

## 10. Logging

Log:

- request ID.
- route/status/duration.
- provider connection state.
- order ID on trading errors.
- unexpected exception stack server-side.

Do not log:

- Password.
- Refresh token.
- Authorization header.
- Full secure cookies.

## 11. Deployment architecture

```text
Browser
  │
  ├── HTTPS ──► Next.js Web
  │
  └── HTTPS/WSS ──► NestJS API
                       │
                       ├── PostgreSQL
                       └── Exchange market data
```

## 12. Deployment requirements

### Web host

Must support stable Next.js deployment.

### API host

Must support:

- Long-lived WebSocket connections.
- Normal Node.js process.
- TLS termination or secure WSS via proxy.
- Environment secrets.

Avoid a platform/runtime that only supports short-lived serverless request functions for the realtime gateway.

### Database

Managed PostgreSQL with:

- SSL connection.
- Connection pooling suitable for deployment.
- Backups according to provider capability.

## 13. CI/CD

Suggested branches:

- feature branches.
- main protected by CI.

Pipeline:

```text
install
 -> lint
 -> typecheck
 -> unit/integration tests
 -> build
 -> deploy preview/staging
 -> e2e
 -> production
```

The exact promotion model can be simplified for a personal project.

## 14. Health checks

API:

```text
GET /api/v1/health
```

P1:

- Database connectivity.
- Market provider connection status.
- Last market update timestamp.

Do not expose sensitive infrastructure details in public health responses.
