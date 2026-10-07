import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";
import { URL } from "node:url";

import { resolveIntegrationEnvironment } from "../../scripts/integration-test-database.mjs";
import { createO04MarketFixture } from "./o04-market-fixture.mjs";

const require = createRequire(import.meta.url);

export async function startO04Server() {
  let testEnvironment = "";
  try {
    testEnvironment = readFileSync(new URL("../../.env.test", import.meta.url), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("Could not read apps/api/.env.test.");
  }
  // Fail before creating Nest/Prisma or modifying the process environment.
  const environment = resolveIntegrationEnvironment(process.env, testEnvironment);
  const overrides = {
    NODE_ENV: "test",
    DATABASE_URL: environment.DATABASE_URL,
    JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
    WEB_ORIGIN: "http://127.0.0.1:3110",
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);

  const email = `o04-e2e-${randomUUID()}@example.com`;
  let app;
  let client;
  let ownsFixture = false;
  const provider = createO04MarketFixture();

  const restoreEnvironment = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  const close = async () => {
    try {
      // Stop incoming ticks before cleanup/disconnect can race a background evaluator query.
      await provider.close();
      if (ownsFixture) {
        // Exact per-run email only; never truncate/reset a shared test database.
        const where = { user: { email } };
        await client.$transaction([
          client.trade.deleteMany({ where }),
          client.order.deleteMany({ where }),
          client.position.deleteMany({ where }),
          client.walletBalance.deleteMany({ where }),
          client.user.deleteMany({ where: { email } }),
        ]);
        ownsFixture = false;
      }
    } finally {
      try {
        await app?.close();
      } finally {
        restoreEnvironment();
      }
    }
  };

  try {
    const { Test } = require("@nestjs/testing");
    const { WsAdapter } = require("@nestjs/platform-ws");
    const { AppModule } = require("../../dist/app.module.js");
    const { PrismaService } = require("../../dist/database/prisma.service.js");
    const { configureHttpApplication } = require("../../dist/config/http-application.js");
    const { MARKET_DATA_PROVIDER } = require("../../dist/markets/provider/market-data-provider.js");
    const { parseRealtimeMessage } = require("../../dist/realtime/realtime-message-parser.js");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MARKET_DATA_PROVIDER)
      .useValue(provider)
      .compile();
    app = module.createNestApplication({ logger: false });
    client = app.get(PrismaService).client;
    // Connect before declaring readiness; a missing database is an error, never a skipped test.
    if (await client.user.findUnique({ where: { email } }))
      throw new Error("Fixture already exists.");
    ownsFixture = true;
    configureHttpApplication(app, { webOrigin: overrides.WEB_ORIGIN });
    app.useWebSocketAdapter(new WsAdapter(app, { messageParser: parseRealtimeMessage }));
    await app.listen(3111, "127.0.0.1");
    return {
      email,
      close,
      async readState() {
        const user = await client.user.findUniqueOrThrow({
          where: { email },
          select: {
            id: true,
            _count: { select: { sessions: true } },
            walletBalances: {
              select: { asset: true, available: true, locked: true },
              orderBy: { asset: "asc" },
            },
            positions: {
              select: { asset: true, quantity: true, averageCostUsd: true, realizedPnlUsd: true },
            },
            orders: {
              select: {
                id: true,
                symbol: true,
                side: true,
                type: true,
                status: true,
                quantity: true,
                filledQuantity: true,
                avgFillPrice: true,
              },
            },
            trades: {
              select: { orderId: true, side: true, quantity: true, price: true, quoteAmount: true },
            },
          },
        });
        return {
          userId: user.id,
          sessions: user._count.sessions,
          balances: user.walletBalances.map(({ asset, available, locked }) => ({
            asset,
            available: available.toString(),
            locked: locked.toString(),
          })),
          positions: user.positions.map(({ asset, quantity, averageCostUsd, realizedPnlUsd }) => ({
            asset,
            quantity: quantity.toString(),
            averageCost: averageCostUsd.toString(),
            realizedPnl: realizedPnlUsd.toString(),
          })),
          orders: user.orders.map(
            ({ id, symbol, side, type, status, quantity, filledQuantity, avgFillPrice }) => ({
              id,
              symbol,
              side,
              type,
              status,
              quantity: quantity.toString(),
              filledQuantity: filledQuantity.toString(),
              avgFillPrice: avgFillPrice?.toString() ?? null,
            }),
          ),
          trades: user.trades.map(({ orderId, side, quantity, price, quoteAmount }) => ({
            orderId,
            side,
            quantity: quantity.toString(),
            price: price.toString(),
            quoteAmount: quoteAmount.toString(),
          })),
        };
      },
    };
  } catch {
    await close();
    throw new Error("O04 E2E API startup failed. Check the dedicated test database and port 3111.");
  }
}
