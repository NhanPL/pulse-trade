# Real-time Trading Dashboard — Project Documentation

This folder is the implementation specification for a portfolio-grade **real-time crypto market dashboard + paper trading application**.

The project uses real public market data but **never handles real money, deposits, withdrawals, wallets, KYC, leverage, margin, futures, or blockchain transactions**.

## How to read this documentation

Recommended order:

1. `00_PROJECT_OVERVIEW.md` — product scope and goals.
2. `01_PRODUCT_REQUIREMENTS.md` — complete functional/non-functional requirements.
3. `02_TECH_STACK.md` — selected technologies and why.
4. `03_SYSTEM_ARCHITECTURE.md` — system/data-flow architecture.
5. `04_DOMAIN_BUSINESS_RULES.md` — trading domain rules and calculations.
6. `05_DATABASE_DESIGN.md` — tables, relationships, constraints and transaction boundaries.
7. `06_API_DESIGN.md` — REST API contract.
8. `07_WEBSOCKET_SPEC.md` — real-time event contract.
9. `08_FRONTEND_ARCHITECTURE.md` — frontend state/data/component architecture.
10. `09_FOLDER_STRUCTURE.md` — monorepo folder structure.
11. `screens/*` — detailed specification for every screen.
12. `10_DEVELOPMENT_PLAN.md` — implementation phases.
13. `11_TESTING_QUALITY_PERFORMANCE.md` — testing, performance and observability.
14. `12_SECURITY_DEPLOYMENT.md` — authentication, security and deployment.
15. `13_CODING_CONVENTIONS.md` — engineering conventions.
16. `14_TASK_BACKLOG.md` — issue-oriented implementation backlog.

## MVP pages

| Route | Access | Main purpose |
|---|---|---|
| `/` | Public | Market overview and discovery |
| `/trade/[symbol]` | Public; trading requires auth | Main real-time trading workspace |
| `/login` | Guest | Sign in |
| `/register` | Guest | Create account and virtual wallet |
| `/portfolio` | Authenticated | Holdings, balances and P&L |
| `/orders` | Authenticated | Open orders and order history |
| `/watchlist` | Authenticated | User-selected markets |

## Core engineering goals

The portfolio value comes from solving these problems well:

- High-frequency WebSocket data without unnecessary React re-renders.
- Clear separation between server state and streaming state.
- Reconnect, stale-data detection and subscription lifecycle.
- Order-book snapshot + incremental updates.
- Transaction-safe virtual wallet updates.
- Market and limit order business rules.
- Weighted-average cost and realized/unrealized P&L.
- Strict TypeScript contracts shared by frontend and backend.
- Responsive trading UI on desktop, tablet and mobile.
- Unit, integration and E2E tests.
- CI/CD, production error reporting and monitoring.

## Explicit non-goals

Do not add these to MVP:

- Real-money trading.
- Crypto deposit/withdrawal.
- Blockchain wallet or MetaMask.
- KYC/AML.
- Futures, margin, leverage, short selling.
- Copy trading.
- Smart contracts/NFT/Web3 functionality.
- Microservices/Kafka/Kubernetes.
- Hundreds of market symbols.

The project should be completed and polished before adding scope.
