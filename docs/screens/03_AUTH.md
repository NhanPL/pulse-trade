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

I08 implementation note: registration currently returns a user without creating a
session, and the login page is scoped to I09. Until that route is available, show
an accessible success panel on `/register` with a `/login?registered=1` link and
an Explore markets link, rather than automatically navigating to a missing page.
The eventual login redirect/notice remains part of the auth-flow integration.

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
- [ ] Login works.
- [ ] Auth survives reload.
- [ ] Intended route can be restored after login.
- [ ] Logout from app shell removes private data access.
- [ ] Forms are keyboard accessible.

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
