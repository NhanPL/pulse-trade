# 09 — Folder Structure

## 1. Repository shape

```text
pulse-trade/
├─ apps/
│  ├─ web/
│  └─ api/
├─ packages/
│  └─ contracts/
├─ docs/
├─ .github/
│  └─ workflows/
├─ package.json
├─ pnpm-workspace.yaml
├─ pnpm-lock.yaml
├─ .editorconfig
├─ .gitignore
└─ README.md
```

## 2. Frontend structure

```text
apps/web/
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ (public)/
│  │  │  ├─ page.tsx                    # market overview
│  │  │  └─ trade/
│  │  │     └─ [symbol]/page.tsx
│  │  ├─ (guest)/
│  │  │  ├─ login/page.tsx
│  │  │  └─ register/page.tsx
│  │  ├─ (protected)/
│  │  │  ├─ portfolio/page.tsx
│  │  │  ├─ orders/page.tsx
│  │  │  └─ watchlist/page.tsx
│  │  ├─ error.tsx
│  │  ├─ not-found.tsx
│  │  ├─ layout.tsx
│  │  └─ globals.css
│  │
│  ├─ components/
│  │  ├─ layout/
│  │  │  ├─ AppHeader.tsx
│  │  │  ├─ DesktopNav.tsx
│  │  │  └─ MobileNav.tsx
│  │  └─ ui/
│  │     ├─ Button.tsx
│  │     ├─ Input.tsx
│  │     ├─ Badge.tsx
│  │     ├─ Tabs.tsx
│  │     ├─ Skeleton.tsx
│  │     ├─ EmptyState.tsx
│  │     └─ ErrorState.tsx
│  │
│  ├─ features/
│  │  ├─ auth/
│  │  │  ├─ api/
│  │  │  ├─ components/
│  │  │  ├─ hooks/
│  │  │  └─ schemas/
│  │  ├─ market/
│  │  │  ├─ api/
│  │  │  ├─ components/
│  │  │  ├─ hooks/
│  │  │  ├─ model/
│  │  │  └─ utils/
│  │  ├─ realtime/
│  │  │  ├─ model/
│  │  │  └─ hooks/
│  │  ├─ trading/
│  │  │  ├─ components/
│  │  │  │  ├─ chart/
│  │  │  │  ├─ order-book/
│  │  │  │  ├─ recent-trades/
│  │  │  │  └─ order-form/
│  │  │  ├─ hooks/
│  │  │  ├─ model/
│  │  │  └─ utils/
│  │  ├─ orders/
│  │  ├─ portfolio/
│  │  └─ watchlist/
│  │
│  ├─ lib/
│  │  ├─ api/
│  │  │  ├─ client.ts
│  │  │  ├─ errors.ts
│  │  │  └─ auth.ts
│  │  ├─ realtime/
│  │  │  ├─ RealtimeClient.ts
│  │  │  ├─ subscription-manager.ts
│  │  │  └─ event-router.ts
│  │  ├─ query/
│  │  │  └─ query-client.ts
│  │  ├─ format/
│  │  └─ env/
│  │
│  ├─ hooks/
│  ├─ providers/
│  │  ├─ QueryProvider.tsx
│  │  └─ RealtimeProvider.tsx
│  └─ test/
│     ├─ setup.ts
│     ├─ factories/
│     └─ mocks/
│
├─ e2e/
├─ next.config.ts
├─ playwright.config.ts
├─ vitest.config.ts
├─ tsconfig.json
└─ package.json
```

## 3. Backend structure

```text
apps/api/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
│
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  │
│  ├─ common/
│  │  ├─ decorators/
│  │  ├─ filters/
│  │  ├─ guards/
│  │  ├─ interceptors/
│  │  ├─ pipes/
│  │  ├─ errors/
│  │  └─ logging/
│  │
│  ├─ config/
│  │  ├─ env.schema.ts
│  │  └─ configuration.ts
│  │
│  ├─ database/
│  │  ├─ database.module.ts
│  │  └─ prisma.service.ts
│  │
│  ├─ auth/
│  │  ├─ auth.module.ts
│  │  ├─ auth.controller.ts
│  │  ├─ auth.service.ts
│  │  ├─ session.service.ts
│  │  └─ strategies/
│  │
│  ├─ users/
│  ├─ markets/
│  │  ├─ market.module.ts
│  │  ├─ market.controller.ts
│  │  ├─ market.service.ts
│  │  ├─ supported-markets.ts
│  │  └─ provider/
│  │     ├─ market-data-provider.ts
│  │     ├─ coinbase-provider.ts
│  │     ├─ coinbase-normalizer.ts
│  │     └─ provider-reconnect.service.ts
│  │
│  ├─ realtime/
│  │  ├─ realtime.module.ts
│  │  ├─ realtime.gateway.ts
│  │  ├─ subscription-registry.service.ts
│  │  ├─ market-cache.service.ts
│  │  └─ freshness.service.ts
│  │
│  ├─ orders/
│  │  ├─ orders.module.ts
│  │  ├─ orders.controller.ts
│  │  ├─ orders.service.ts
│  │  ├─ order-execution.service.ts
│  │  ├─ pending-order-evaluator.service.ts
│  │  └─ domain/
│  │     ├─ order-rules.ts
│  │     └─ pnl.ts
│  │
│  ├─ portfolio/
│  ├─ watchlist/
│  └─ health/
│
├─ test/
│  ├─ integration/
│  └─ factories/
│
├─ tsconfig.json
└─ package.json
```

## 4. Shared contracts package

```text
packages/contracts/
├─ src/
│  ├─ auth/
│  │  ├─ auth.schema.ts
│  │  └─ auth.types.ts
│  ├─ markets/
│  ├─ orders/
│  ├─ portfolio/
│  ├─ watchlist/
│  ├─ realtime/
│  │  ├─ envelope.schema.ts
│  │  ├─ events.schema.ts
│  │  └─ commands.schema.ts
│  ├─ common/
│  │  ├─ decimal.schema.ts
│  │  └─ error.schema.ts
│  └─ index.ts
├─ tsconfig.json
└─ package.json
```

Rules:

- Only cross-app contracts belong here.
- Do not move backend services/entities or frontend view models into shared contracts.
- Avoid circular dependencies.

## 5. Docs inside repository

Copy this documentation set into:

```text
docs/
```

Screen docs can remain under:

```text
docs/screens/
```

## 6. Naming conventions

Frontend:

- React components: `PascalCase.tsx`.
- Hooks: `useSomething.ts`.
- Pure utilities: `camel-case.ts` or agreed consistent style.
- Tests next to source when focused; larger integration tests in dedicated test folders.

Backend:

- Nest files follow `*.controller.ts`, `*.service.ts`, `*.module.ts`.
- Domain pure functions should not be forced into Nest class wrappers.

## 7. What not to create

Avoid generic catch-all folders:

```text
helpers/
misc/
common/components/everything/
utils/utils2.ts
```

Every module should have a clear owner/responsibility.
