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
