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
const { LimitBuyService } = require("../../dist/trading/limit-buy.service.js");
const { MarketOrderError } = require("../../dist/trading/market-order.error.js");

test("limit BUY reserves quote funds atomically without creating a fill", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `limit-buy-${randomUUID()}`;
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

  const service = new LimitBuyService({ client });
  const user = await client.user.create({
    data: { email: emails[0], passwordHash: "not-used-by-this-transaction-test" },
  });
  await client.walletBalance.create({
    data: { asset: "USD", available: "10000", locked: "0", userId: user.id },
  });

  await t.test("moves available USD to locked USD and records only a pending order", async () => {
    const reservation = await service.reserve({
      limitPrice: "65000",
      quantity: "0.1",
      symbol: "BTC-USD",
      userId: user.id,
    });
    assert.equal(reservation.reservedAmount, "6500");

    const [usd, order, btcWalletCount, positionCount, tradeCount] = await Promise.all([
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "USD", userId: user.id } },
      }),
      client.order.findUniqueOrThrow({ where: { id: reservation.orderId } }),
      client.walletBalance.count({ where: { asset: "BTC", userId: user.id } }),
      client.position.count({ where: { asset: "BTC", userId: user.id } }),
      client.trade.count({ where: { userId: user.id } }),
    ]);
    assert.equal(usd.available.toString(), "3500");
    assert.equal(usd.locked.toString(), "6500");
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
        limitPrice: "65000",
        quantity: "0.1",
        reservedAmount: "6500",
        reservedAsset: "USD",
        side: "BUY",
        status: "PENDING",
        type: "LIMIT",
      },
    );
    assert.equal(btcWalletCount, 0);
    assert.equal(positionCount, 0);
    assert.equal(tradeCount, 0);
  });

  await t.test("rolls back the order when available USD is insufficient", async () => {
    await assert.rejects(
      service.reserve({ limitPrice: "4000", quantity: "1", symbol: "BTC-USD", userId: user.id }),
      (error) => error instanceof MarketOrderError && error.code === "INSUFFICIENT_BALANCE",
    );

    const [usd, orderCount] = await Promise.all([
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "USD", userId: user.id } },
      }),
      client.order.count({ where: { userId: user.id } }),
    ]);
    assert.equal(usd.available.toString(), "3500");
    assert.equal(usd.locked.toString(), "6500");
    assert.equal(orderCount, 1);
  });

  await t.test("allows only one concurrent order to reserve the same USD", async () => {
    const concurrentUser = await client.user.create({
      data: { email: emails[1], passwordHash: "not-used-by-this-transaction-test" },
    });
    await client.walletBalance.create({
      data: { asset: "USD", available: "10000", locked: "0", userId: concurrentUser.id },
    });

    const results = await Promise.allSettled([
      service.reserve({
        limitPrice: "6000",
        quantity: "1",
        symbol: "BTC-USD",
        userId: concurrentUser.id,
      }),
      service.reserve({
        limitPrice: "6000",
        quantity: "1",
        symbol: "BTC-USD",
        userId: concurrentUser.id,
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result) => result.status === "rejected");
    assert.equal(rejection?.reason instanceof MarketOrderError, true);
    assert.equal(rejection?.reason.code, "INSUFFICIENT_BALANCE");

    const [usd, orderCount, tradeCount] = await Promise.all([
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "USD", userId: concurrentUser.id } },
      }),
      client.order.count({ where: { userId: concurrentUser.id } }),
      client.trade.count({ where: { userId: concurrentUser.id } }),
    ]);
    assert.equal(usd.available.toString(), "4000");
    assert.equal(usd.locked.toString(), "6000");
    assert.equal(orderCount, 1);
    assert.equal(tradeCount, 0);
  });
});
