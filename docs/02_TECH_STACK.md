# 02 — Technology Stack

## 1. Stack principles

The chosen stack should:

- Strengthen a React/TypeScript portfolio.
- Expose real-time engineering problems.
- Remain small enough for one developer.
- Prefer mainstream technologies that are easy to explain in interviews.
- Avoid infrastructure complexity that does not improve the core demo.

Package versions should be pinned to stable releases when implementation starts. Avoid blindly using floating `latest` versions in production lockfiles.

## 2. Repository/package management

### pnpm workspace

Use a monorepo with:

- `apps/web`
- `apps/api`
- `packages/contracts`

Why:

- Single repository and lockfile.
- Shared TypeScript/Zod contracts.
- Easier atomic frontend/backend changes.
- Good portfolio demonstration without requiring a heavy monorepo tool.

Turborepo is optional; do not introduce it until build orchestration becomes useful.

## 3. Frontend

### Next.js — App Router

Role:

- Application routing/layouts.
- Public/private route structure.
- Server/client rendering boundaries.
- Production build/deployment.

Rules:

- Use App Router.
- Keep realtime/chart/order-form surfaces as Client Components.
- Do not force Server Components around high-frequency state.
- Use Server Components where they naturally reduce client JavaScript for static shell/content.

### React + TypeScript

- Strict TypeScript.
- Feature-based components.
- Reusable UI primitives.
- No global mega-context for high-frequency market data.

### Tailwind CSS

Chosen instead of a large UI framework for this project because the portfolio should demonstrate custom responsive UI and component construction.

Use:

- CSS variables for semantic theme tokens.
- Consistent spacing/typography scale.
- Shared primitives for Button/Input/Tabs/Table/Badge/Skeleton/Modal/Drawer.

Avoid copying an entire exchange visual identity.

### TanStack Query v5

Use for REST/server state:

- Current user.
- Portfolio snapshot.
- Orders.
- Watchlist.
- REST market metadata/history when appropriate.

Use mutations for:

- Login/register where applicable.
- Place order.
- Cancel order.
- Watchlist mutation.

Do **not** use repeated query refetching to simulate realtime ticker/order-book feeds.

### Zustand

Use for high-frequency/client realtime state:

- Connection status.
- Latest ticker values.
- Order-book models.
- Recent trade buffers.
- Current realtime candle.

Rules:

- Split stores by responsibility where useful.
- Prefer selectors so a component subscribes only to needed fields.
- Avoid one giant store that causes broad subscriptions.

### TradingView Lightweight Charts

Use for:

- Candlestick OHLC chart.
- Optional volume series later.

Important:

- Chart is client-side.
- Treat chart instance as an imperative integration boundary.
- Do not place thousands of chart points in React component state simply to feed the chart.
- Update series directly when practical.

### React Hook Form + Zod

Use for:

- Register/login forms.
- Market/limit order form.

Zod is also used in `packages/contracts` for shared runtime validation where appropriate.

### Decimal formatting

Frontend should normally receive authoritative financial values as strings and use a decimal library only where client-side calculations are needed for display previews.

Never let a frontend preview override backend-calculated truth.

## 4. Backend

### NestJS + TypeScript

Use modules:

- AuthModule
- UsersModule
- MarketModule
- RealtimeModule
- OrdersModule
- PortfolioModule
- WatchlistModule
- HealthModule

Why NestJS:

- Clear modular structure.
- Dependency injection.
- Guards/pipes/filters/interceptors.
- First-class WebSocket gateway concept.
- Good contrast with simpler Express projects.

### Raw WebSocket adapter (`ws`)

Prefer standard WebSocket semantics for this project rather than making Socket.IO-specific features part of the protocol.

Use NestJS WebSocket Gateway/adaptor around `ws`.

Responsibilities:

- Client connections.
- Subscription commands.
- Broadcast normalized market events.
- Connection lifecycle.

### Market provider adapter

Initial provider: public Coinbase market data.

Create an internal interface so provider code is isolated:

```ts
interface MarketDataProvider {
  connect(): Promise<void>;
  subscribe(request: ProviderSubscription): void;
  unsubscribe(request: ProviderSubscription): void;
  close(): Promise<void>;
}
```

Do not scatter provider-specific payload handling throughout business modules.

### PostgreSQL

Authoritative persistence for:

- Users.
- Sessions.
- Wallet balances.
- Positions.
- Orders.
- Trades.
- Watchlist.

Use decimal-capable `NUMERIC` columns for financial values.

Do not store every market tick in PostgreSQL in MVP.

### Prisma ORM

Use for:

- Schema/migrations.
- Normal CRUD.
- Transactions.
- Type-safe database access.

For advanced locking/concurrency where ORM abstraction is insufficient, a small, well-reviewed raw SQL section is acceptable.

### Redis — optional Phase 2/P1

MVP may use process memory for latest market snapshot if only one API instance exists.

Introduce Redis when needed for:

- Shared latest-price cache across API instances.
- Pub/sub across multiple realtime gateway instances.
- Rate limiting/session support if desired.

Do not make Redis a blocker for the first end-to-end version.

## 5. Authentication

Recommended:

- Password hash: Argon2id or bcrypt.
- Short-lived access token.
- Refresh/session credential in Secure HttpOnly cookie.
- Session record or hashed refresh-token identifier stored server-side.

Frontend access token should be kept in memory when practical.

Avoid storing refresh tokens in `localStorage`.

## 6. Testing

### Frontend unit/component

- Vitest.
- React Testing Library.

Test:

- Pure financial display/helper logic.
- Order form validation.
- Realtime selectors/reducers/data transforms.
- Important UI states.

### Backend

- Nest testing utilities.
- Jest or the test runner configured by the backend scaffold.
- Supertest for HTTP integration.

Test transaction-critical order scenarios thoroughly.

### End-to-end

- Playwright.

Critical flow:

Register -> login/session -> open market -> create order -> view portfolio -> create/cancel limit order.

## 7. Code quality

- ESLint.
- Prettier.
- TypeScript `strict`.
- `lint-staged`/Husky optional.
- Conventional Commit style optional, but commit messages should be meaningful.

## 8. CI/CD

GitHub Actions pipeline:

1. Install dependencies from lockfile.
2. Lint.
3. Typecheck.
4. Unit tests.
5. Backend tests.
6. Build web/api.
7. E2E on suitable branch/environment.

## 9. Monitoring

Frontend:

- Sentry or equivalent for uncaught production errors.
- Track realtime connection errors/reconnect loops.

Backend:

- Structured logs.
- Health endpoint.
- Log provider disconnect/reconnect.
- Log order processing failures with correlation/order ID, never sensitive credential content.

## 10. Deployment targets

Recommended shape:

- Web: Vercel or equivalent Next.js platform.
- API/WebSocket: a service that supports long-lived WebSocket connections.
- PostgreSQL: managed Postgres such as Supabase/Neon/another provider.
- Redis: managed provider only when P1 scaling is implemented.

Do not choose an API hosting plan that aggressively sleeps if a reliable realtime demo is a project goal.
