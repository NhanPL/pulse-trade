import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { DatabaseModule } = require("../../dist/database/database.module.js");
const { PrismaService } = require("../../dist/database/prisma.service.js");

test("trading models preserve ownership and financial database invariants", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `trading-models-${randomUUID()}`;
  const emails = [`${prefix}@example.com`, `${prefix}-other@example.com`];

  t.after(async () => {
    try {
      await client.$transaction([
        client.trade.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.order.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.position.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.user.deleteMany({ where: { email: { in: emails } } }),
      ]);
    } finally {
      await app.close();
    }
  });

  const user = await client.user.create({
    data: { email: emails[0], passwordHash: "not-used-by-this-schema-test" },
  });
  const otherUser = await client.user.create({
    data: { email: emails[1], passwordHash: "not-used-by-this-schema-test" },
  });
  const position = await client.position.create({
    data: {
      userId: user.id,
      asset: "BTC",
      quantity: "0.010000000000000000",
      averageCostUsd: "65000.000000000000000000",
      realizedPnlUsd: "0",
    },
  });
  const order = await client.order.create({
    data: {
      userId: user.id,
      symbol: "BTC-USD",
      baseAsset: "BTC",
      quoteAsset: "USD",
      side: "BUY",
      type: "MARKET",
      status: "FILLED",
      quantity: "0.010000000000000000",
      filledQuantity: "0.010000000000000000",
      avgFillPrice: "65000.000000000000000000",
      filledAt: new Date(),
      idempotencyKey: `market-buy-${prefix}`,
    },
  });
  const trade = await client.trade.create({
    data: {
      orderId: order.id,
      userId: user.id,
      symbol: "BTC-USD",
      side: "BUY",
      price: "65000.000000000000000000",
      quantity: "0.010000000000000000",
      quoteAmount: "650.000000000000000000",
    },
  });

  assert.equal(position.quantity.toString(), "0.01");
  assert.equal(trade.orderId, order.id);
  assert.equal(trade.userId, user.id);
  const persisted = await client.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { orders: { include: { trades: true } }, positions: true, trades: true },
  });
  assert.equal(persisted.positions.length, 1);
  assert.equal(persisted.orders.length, 1);
  assert.equal(persisted.orders[0].trades[0].id, trade.id);
  assert.equal(persisted.trades[0].orderId, order.id);

  await assert.rejects(
    client.position.create({ data: { userId: user.id, asset: "BTC" } }),
    (error) => error.code === "P2002",
  );
  await assert.rejects(
    client.order.create({
      data: {
        userId: user.id,
        symbol: "ETH-USD",
        baseAsset: "ETH",
        quoteAsset: "USD",
        side: "BUY",
        type: "MARKET",
        status: "FILLED",
        quantity: "1",
        idempotencyKey: `market-buy-${prefix}`,
      },
    }),
    (error) => error.code === "P2002",
  );
  await assert.rejects(
    client.trade.create({
      data: {
        orderId: order.id,
        userId: otherUser.id,
        symbol: "BTC-USD",
        side: "BUY",
        price: "65000",
        quantity: "0.01",
        quoteAmount: "650",
      },
    }),
    (error) => error.code === "P2003",
  );
  await assert.rejects(
    client.order.create({
      data: {
        userId: user.id,
        symbol: "BTC-USD",
        baseAsset: "BTC",
        quoteAsset: "USD",
        side: "BUY",
        type: "MARKET",
        status: "FILLED",
        quantity: "0.01",
        limitPrice: "65000",
      },
    }),
  );
});
