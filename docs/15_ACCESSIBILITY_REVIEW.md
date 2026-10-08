# O08 — Accessibility review

Reviewed on 2026-10-08 against AGENTS.md, the accessibility checklist in
`11_TESTING_QUALITY_PERFORMANCE.md`, and the MVP screen specifications. This is a
focused engineering review, not a WCAG certification or a replacement for
assistive-technology user testing.

## Scope and method

- Chromium production builds at 1586 × 992 desktop and 390 × 844 mobile.
- All seven MVP routes: Markets, Trading, Login, Register, Portfolio, Orders and
  Watchlist. Private pages use synthetic, isolated authenticated responses.
- Full-document axe-core scans with default rules: no exclusions, disabled rules,
  violation allowlist or retries. The exact version already present in the lockfile
  is now an explicit web **dev dependency**, not a production dependency.
- Visible-state rescans: mobile navigation, Recent Trades, BUY/SELL and MARKET/LIMIT,
  cancellation dialog, auth validation, and private-page loading/empty/error states.
- Real browser keyboard checks plus RTL tests for shared inputs, tabs and mobile
  navigation. Desktop/mobile screenshots stay in ignored local test output.

## Findings and focused fixes

| Finding | Resolution |
| --- | --- |
| Repeated app navigation had no keyboard bypass. | A first-focusable skip link targets the focusable main landmark, including auth and protected-route fallback panels. |
| Escape removed the focused mobile menu link without restoring focus. | Dismissal restores the persistent menu trigger; the pointer-only backdrop is no longer a duplicate keyboard stop. The disclosure remains non-modal. |
| BUY/SELL had two sequential tab stops and no arrow-key navigation. | Roving focus, Left/Right wrapping and Home/End follow the existing order-type tab pattern; selected state and visible labels are retained. |
| Trading mobile panels lacked complete tab/panel relationships. | Stable tab IDs, labelled tabpanels and visible panel focus rings. |
| Order form used an ARIA role not allowed on a form element. | A separate tabpanel wraps a named semantic form. Submission, validation and desktop sizing remain unchanged. |
| Scrollable trading tables could not be reached reliably by keyboard. | Named, focusable scrolling regions with visible inset focus rings; arrow-key scrolling is browser-tested. |
| Dialog focus did not cycle at both endpoints. | Keep native dialog/inertness, initial focus and restoration; explicitly wrap Tab/Shift+Tab between visible enabled controls. |
| Destructive-button text contrast was 2.98:1. | Existing inverse text token increases contrast to approximately 6.01:1 on the unchanged coral background. |
| Auth CTA white text on teal gradients needed manual contrast review. | Use the same inverse text token; browser tests calculate contrast against both resolved gradient stops and require at least 4.5:1. Keep the gradient and layout. |
| Holdings action header was empty. | Screen-reader text inside the scoped table header. |
| Watchlist summary definition-list structure was invalid. | Each metric has a valid dt/dd group; decorative icons remain hidden outside the lists. |
| Watchlist footer used an unsupported status role; named badges used generic spans. | Valid named status containers; watchlist E2E locators now address that accessible role/name without removing their assertions. |

## Checklist review

- Inputs retain visible associated labels, required state and linked hints/errors;
  correcting an error removes its obsolete description. Invalid auth submission
  focuses Email, and the shared input tests check composed descriptions.
- Tabs retain automatic activation, selected state, disabled behavior and panel
  relationships. Shared-tab tests cover horizontal/vertical navigation and disabled
  tabs. Trading-specific checks cover side/type selection and mobile panel scrolling.
- Cancellation initially focuses inside its named/described native modal, cycles
  focus in both directions and restores the trigger after Escape. Existing pending,
  retry, conflict and cancellation transaction assertions remain active.
- Tables retain captions/scoped headers; responsive holdings/order/watchlist cards
  retain their labelled values. Icon-only controls have action-specific names.
- P&L and 24h changes include signs; BUY/SELL and connection states include text.
  Ticker prices, order-book deltas, trades and chart points are not live regions.
  Only low-frequency connection/data-state messages use polite status semantics.
- The midnight/teal design, panel layout and responsive hierarchy are retained.
  Main controls use existing 40–56px targets, password visibility is 32px, disclosures
  28px, and mobile order-card cancellation retains its specified 44px target. Inline
  links remain readable and keyboard-accessible; this is not an all-controls-44px claim.
- Desktop trading remains one viewport with LIMIT/BUY visible; auth fields/actions
  and mobile controls remain reachable. Existing small-mobile/tablet/layout suites
  cover breakpoints beyond the audit's two representative viewport sizes.

## Reproduce and regression checks

```bash
pnpm --filter @pulse-trade/web test:e2e accessibility.spec.ts
pnpm --filter @pulse-trade/web test
pnpm --filter @pulse-trade/web test:e2e
pnpm --filter @pulse-trade/web test:e2e:realtime
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

Playwright's existing CI command automatically includes the accessibility suite.
Use one Playwright configuration at a time; they share Next build output. Real
account/trading/watchlist tests still require the separately guarded PostgreSQL
test database and run in CI. Browser mocks do not replace those integration tests.
Run a normal build after browser testing before using the bundle for deployment.

## Limits and follow-up verification

Axe's `incomplete` results are recorded as `axe-manual-review` annotations, not
silently treated as conformance. Image/gradient/composited backgrounds and canvas
content cannot be fully checked by the automated scan. Auth gradients additionally
have explicit color-conversion/contrast assertions; screenshots and existing theme
tokens were reviewed, including the unchanged muted-text and cyan-focus colors.
Solid muted text on the hover surface is approximately 4.87:1 and the cyan focus
color on the elevated surface approximately 12.18:1; these are token comparisons,
not a certification of every possible background/state.

NVDA/VoiceOver and physical touch-device testing were not performed in this
environment. The chart retains its existing named image boundary rather than a
new OHLC text-alternative feature. A manual screen-reader/physical-device pass,
including chart comprehension and announcements during long sessions, remains
appropriate before claiming full accessibility conformance. No business rules,
REST/WS lifecycle, persistence, additional backlog feature or Epic P performance
work is implemented by this review.
