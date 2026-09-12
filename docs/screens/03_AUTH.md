# Screen 03 — Login & Register

Routes:

- `/login`
- `/register`

Access: Guest-focused.

## 1. Goal

Provide simple secure entry to paper trading without distracting from the trading product.

## 2. Shared auth layout

Desktop can use centered card/panel.

Mobile uses full-width form with safe spacing.

Do not build a complex marketing split-screen unless design time is available after MVP.

## 3. Login component tree

```text
LoginPage
└─ AuthCard
   ├─ Logo/Title
   ├─ LoginForm
   │  ├─ EmailField
   │  ├─ PasswordField
   │  ├─ FormError
   │  └─ SubmitButton
   └─ RegisterLink
```

## 4. Register component tree

```text
RegisterPage
└─ AuthCard
   ├─ Logo/Title
   ├─ RegistrationHint
   │  └─ "Receive $10,000 virtual USD"
   ├─ RegisterForm
   │  ├─ EmailField
   │  ├─ PasswordField
   │  ├─ ConfirmPasswordField
   │  ├─ FormError
   │  └─ SubmitButton
   └─ LoginLink
```

## 5. Validation

Login:

- valid email.
- password required.

Register:

- valid email.
- password >= 8 chars.
- confirm matches.

Backend remains authoritative for uniqueness/credentials.

## 6. Success behavior

If login was triggered from a protected action/page, return user to intended route.

Example:

```text
/trade/BTC-USD -> click Buy -> login -> /trade/BTC-USD
```

After registration, preferred UX:

- Sign user in immediately if session design supports it.
- Otherwise redirect to login with success notice.

I08/I09 implementation note: registration returns a user without creating a
session. The existing accessible success panel on `/register` links to
`/login?registered=1`, which now displays the registration success notice.
The panel also retains its Explore markets link; registration does not auto-login.

## 7. Errors

Map stable codes:

- duplicate email.
- invalid credentials.
- rate limited.
- server unavailable.

Do not expose whether a specific email exists during login.

## 8. Loading

- Disable submit while request active.
- Preserve typed fields on recoverable failure.

## 9. Acceptance criteria

- [ ] Register validation works.
- [ ] Account gets exactly one virtual USD allocation.
- [x] Login works.
- [x] Auth survives reload.
- [x] Intended route can be restored after login.
- [x] Logout from app shell removes private data access.
- [x] Forms are keyboard accessible.

## 10. I08 registration implementation

- The centered desktop card follows `docs/design/desktop/register.png` and reuses
  the existing brand, UI controls, theme tokens, and supplied background asset.
  Mobile uses a single-column card without horizontal overflow.
- React Hook Form owns inputs and pending state. Zod extends the shared register
  request schema with client-only password confirmation; only normalized email
  and password are posted to `/api/v1/auth/register`.
- The backend alone creates the user and exactly one initial virtual allocation.
  The page never writes balances, stores credentials, or automatically retries a
  registration request. Success requires a validated response.
- Duplicate email, invalid registration, rate limits, server errors, network
  failures, and malformed responses have safe local messages. Recoverable errors
  preserve inputs; success clears them. Pending submission prevents duplicates,
  has a timeout, and aborts its client request on unmount.
- Inputs have associated labels/errors and password visibility controls. Invalid
  submissions focus the first error; successful submissions focus the confirmation.
- Run `pnpm --filter @pulse-trade/web exec playwright install chromium` once,
  then `pnpm --filter @pulse-trade/web test:register` for focused browser checks.
  These tests mock registration responses and do not replace the existing
  PostgreSQL auth integration tests or the later complete trading E2E flow.

## 11. I09 login implementation

- `/login` follows `docs/design/desktop/login.png`, reusing the registration
  background, brand, theme and form primitives. The unsupported Forgot password
  action in the image is intentionally omitted: recovery is not in I09's API or
  written requirements.
- React Hook Form and the shared Zod login schema validate email and a required
  password (maximum 128 characters). Email is normalized; passwords are never
  trimmed. The form supports keyboard use, password visibility, local errors,
  pending state, a 15-second request timeout and duplicate-submit protection.
- `POST /api/v1/auth/login` uses `credentials: "include"` and validates the success
  response. The API owns the HttpOnly refresh cookie. Configure `WEB_ORIGIN` to
  match the frontend origin and deploy web/API on the same site as documented in
  `12_SECURITY_DEPLOYMENT.md`. No browser storage, credential logging or automatic
  request retries are used. Leaving the page aborts client processing; it cannot
  undo a session already created by the server.
- The provider retains only the access token and expiry in provider-local memory;
  only the confirmed user ID/email is cached in TanStack Query under `['auth', 'me']`.
  The app header reflects that user after client-side navigation. Credentials are
  never stored in the query/mutation cache, localStorage or sessionStorage.
- Successful login replaces the route with a validated `returnTo`, defaulting to
  `/`. Only product routes are accepted; external URLs, auth loops, encoded paths,
  backslashes and control characters are rejected. All 401 responses use the same
  invalid-credentials message, regardless of server body.
- I10 adds automatic refresh, cookie bootstrap after reload, live session
  revalidation and protected-route enforcement. I11 adds the header logout action
  and private cache cleanup; the header is not an authorization guard.
- `pnpm --filter @pulse-trade/web test:login` builds and runs the focused browser
  tests. CI runs both login and registration browser suites plus the existing API
  and PostgreSQL authentication tests. Browser API responses are mocked; they do
  not replace the backend integration suite.

## 12. I10 frontend bootstrap and protected routes

- `AuthSessionProvider` performs one serialized `POST /auth/refresh` on client
  startup (including a browser reload), validates the response, then validates
  `GET /me` with its returned bearer token. `/me` is the final user identity after
  the backend's live session-revocation check. The refresh and `/me` identities
  must agree before the application becomes authenticated.
- The access token and expiry remain provider-local memory only. The verified user
  is cached under `['auth', 'me']`; neither credentials nor tokens are put in
  localStorage, sessionStorage, URLs or mutation/query payloads. The access token
  refreshes at 80% of its lifetime. Refresh calls are serialized because each one
  rotates the HttpOnly credential; a login waits for an active bootstrap refresh.
- The root client boundary protects `/portfolio`, `/orders`, `/watchlist` and any
  nested paths. It holds the child page behind a checking panel, redirects an
  unauthenticated visitor to `/login?returnTo=…`, and preserves only a safe internal
  return path. The later Portfolio, Orders and Watchlist tasks provide those pages;
  I10 provides their shared authorization boundary, not their feature UIs.
- A 401 during refresh or `/me` clears the local identity and redirects protected
  routes to login. A network, schema or server failure does not expose the child
  page or redirect in a loop; it shows an explicit Try again control. There is no
  automatic retry after a failed refresh rotation.
- Set `WEB_ORIGIN` to the actual web origin, and keep credentialed web/API requests
  on the same site as required by `12_SECURITY_DEPLOYMENT.md`.
- `pnpm --filter @pulse-trade/web test:auth` runs the browser coverage for login,
  registration and I10. It checks reload bootstrap, automatic token refresh,
  refresh/login serialization, `/me` verification, safe protected-route redirects,
  failures, explicit retry and absence of browser credential storage.

## 13. I11 logout and private cache cleanup

- The authenticated desktop header and mobile navigation provide a visible, keyboard
  accessible Log out action. It disables while the request is pending and exposes a
  sanitized retry message without discarding the current session after an API or
  network failure.
- Logout waits for an in-flight refresh rotation, then posts `{}` to
  `/auth/logout` with the current in-memory bearer token when it remains valid. On
  `204`, the provider drops its token/user state and removes only `auth`,
  `portfolio`, `orders` and `watchlist` TanStack Query data. Public market caches
  are intentionally retained.
- The protected-route boundary then redirects the signed-out user to Login, with a
  safe return path. A completed logout prevents a late automatic refresh timer from
  restoring the session.
- Browser coverage verifies successful logout, retry after a `503`, refresh/logout
  serialization, protected-route redirection and the mobile keyboard action. The
  focused unit test verifies private query eviction without removing market data.
