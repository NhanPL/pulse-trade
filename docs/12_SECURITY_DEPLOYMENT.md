# 12 — Security & Deployment

## 1. Security scope

Although this is paper trading, implement normal web security correctly because auth/business state is part of the portfolio demonstration.

## 2. Password security

- Hash passwords with Argon2id or bcrypt.
- Never log passwords.
- Use generic invalid-credential messages.
- Apply reasonable login rate limiting in production.

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

## 4. Authorization

Backend determines user from authentication context.

Never trust:

```json
{ "userId": "someone-else" }
```

for wallet/order ownership.

Every order/watchlist/portfolio query must scope by authenticated user.

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
