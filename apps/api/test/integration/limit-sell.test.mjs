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
const { LimitSellService } = require("../../dist/trading/limit-sell.service.js");
const { MarketOrderError } = require("../../dist/trading/market-order.error.js");

test("limit SELL reserves base assets atomically without creating a fill", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `limit-sell-${randomUUID()}`;
  const emails = [`${prefix}@example.com`, `${prefix}-concurrent@example.com`];

  t.after(async () => {
    try {
      await client.$transaction([
        client.trade.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.order.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.position.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.walletBalance.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.user.deleteMany({ where: { email: { in: emails } } }),
      ]);
    } finally {
      await app.close();
    }
  });

  const service = new LimitSellService({ client });
  const user = await client.user.create({
    data: { email: emails[0], passwordHash: "not-used-by-this-transaction-test" },
  });
  await client.$transaction([
    client.walletBalance.create({
      data: { asset: "BTC", available: "2", locked: "0", userId: user.id },
    }),
    client.position.create({
      data: {
        asset: "BTC",
        averageCostUsd: "55000",
        quantity: "2",
        realizedPnlUsd: "20",
        userId: user.id,
      },
    }),
  ]);

  await t.test("moves available BTC to locked BTC and records only a pending order", async () => {
    const reservation = await service.reserve({
      limitPrice: "70000",
      quantity: "0.5",
      symbol: "BTC-USD",
      userId: user.id,
    });
    assert.equal(reservation.reservedAmount, "0.5");
    assert.equal(reservation.reservedAsset, "BTC");

    const [btc, position, order, usdWalletCount, tradeCount] = await Promise.all([
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: user.id } },
      }),
      client.position.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: user.id } },
      }),
      client.order.findUniqueOrThrow({ where: { id: reservation.orderId } }),
      client.walletBalance.count({ where: { asset: "USD", userId: user.id } }),
      client.trade.count({ where: { userId: user.id } }),
    ]);
    assert.equal(btc.available.toString(), "1.5");
    assert.equal(btc.locked.toString(), "0.5");
    assert.deepEqual(
      {
        averageCostUsd: position.averageCostUsd.toString(),
        quantity: position.quantity.toString(),
        realizedPnlUsd: position.realizedPnlUsd.toString(),
      },
      { averageCostUsd: "55000", quantity: "2", realizedPnlUsd: "20" },
    );
    assert.deepEqual(
      {
        avgFillPrice: order.avgFillPrice,
        filledAt: order.filledAt,
        filledQuantity: order.filledQuantity.toString(),
        limitPrice: order.limitPrice?.toString(),
        quantity: order.quantity.toString(),
        reservedAmount: order.reservedAmount.toString(),
        reservedAsset: order.reservedAsset,
        side: order.side,
        status: order.status,
        type: order.type,
      },
      {
        avgFillPrice: null,
        filledAt: null,
        filledQuantity: "0",
        limitPrice: "70000",
        quantity: "0.5",
        reservedAmount: "0.5",
        reservedAsset: "BTC",
        side: "SELL",
        status: "PENDING",
        type: "LIMIT",
      },
    );
    assert.equal(usdWalletCount, 0);
    assert.equal(tradeCount, 0);
  });

  await t.test("rolls back the order when available BTC is insufficient", async () => {
    await assert.rejects(
      service.reserve({ limitPrice: "70000", quantity: "2", symbol: "BTC-USD", userId: user.id }),
      (error) => error instanceof MarketOrderError && error.code === "INSUFFICIENT_BALANCE",
    );

    const [btc, orderCount] = await Promise.all([
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: user.id } },
      }),
      client.order.count({ where: { userId: user.id } }),
    ]);
    assert.equal(btc.available.toString(), "1.5");
    assert.equal(btc.locked.toString(), "0.5");
    assert.equal(orderCount, 1);
  });

  await t.test("allows only one concurrent order to reserve the same BTC", async () => {
    const concurrentUser = await client.user.create({
      data: { email: emails[1], passwordHash: "not-used-by-this-transaction-test" },
    });
    await client.$transaction([
      client.walletBalance.create({
        data: { asset: "BTC", available: "1", locked: "0", userId: concurrentUser.id },
      }),
      client.position.create({
        data: {
          asset: "BTC",
          averageCostUsd: "60000",
          quantity: "1",
          realizedPnlUsd: "0",
          userId: concurrentUser.id,
        },
      }),
    ]);

    const results = await Promise.allSettled([
      service.reserve({
        limitPrice: "70000",
        quantity: "1",
        symbol: "BTC-USD",
        userId: concurrentUser.id,
      }),
      service.reserve({
        limitPrice: "70000",
        quantity: "1",
        symbol: "BTC-USD",
        userId: concurrentUser.id,
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result) => result.status === "rejected");
    assert.equal(rejection?.reason instanceof MarketOrderError, true);
    assert.equal(rejection?.reason.code, "INSUFFICIENT_BALANCE");

    const [btc, position, orderCount, tradeCount] = await Promise.all([
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: concurrentUser.id } },
      }),
      client.position.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: concurrentUser.id } },
      }),
      client.order.count({ where: { userId: concurrentUser.id } }),
      client.trade.count({ where: { userId: concurrentUser.id } }),
    ]);
    assert.equal(btc.available.toString(), "0");
    assert.equal(btc.locked.toString(), "1");
    assert.equal(position.quantity.toString(), "1");
    assert.equal(orderCount, 1);
    assert.equal(tradeCount, 0);
  });
});
