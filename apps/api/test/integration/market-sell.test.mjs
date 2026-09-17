import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { NestFactory } = require("@nestjs/core");
const { PrismaService } = require("../../dist/database/prisma.service.js");
const { DatabaseModule } = require("../../dist/database/database.module.js");
const { MarketOrderError } = require("../../dist/trading/market-order.error.js");
const { MarketSellService } = require("../../dist/trading/market-sell.service.js");

test("market SELL persists one atomic fill and concurrent orders cannot oversell", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `market-sell-${randomUUID()}`;
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

  const service = new MarketSellService({ client }, { getTicker: () => ({ price: "70000" }) });
  const user = await client.user.create({
    data: { email: emails[0], passwordHash: "not-used-by-this-transaction-test" },
  });
  await client.$transaction([
    client.walletBalance.create({
      data: { asset: "USD", available: "1000", locked: "0", userId: user.id },
    }),
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

  await t.test(
    "records proceeds, realized P&L, the filled order, and immutable trade",
    async () => {
      const execution = await service.execute({
        quantity: "0.5",
        symbol: "BTC-USD",
        userId: user.id,
      });
      assert.equal(execution.quoteAmount, "35000");

      const [usd, btc, position, order, trade] = await Promise.all([
        client.walletBalance.findUniqueOrThrow({
          where: { userId_asset: { asset: "USD", userId: user.id } },
        }),
        client.walletBalance.findUniqueOrThrow({
          where: { userId_asset: { asset: "BTC", userId: user.id } },
        }),
        client.position.findUniqueOrThrow({
          where: { userId_asset: { asset: "BTC", userId: user.id } },
        }),
        client.order.findUniqueOrThrow({ where: { id: execution.orderId } }),
        client.trade.findUniqueOrThrow({ where: { id: execution.tradeId } }),
      ]);
      assert.equal(usd.available.toString(), "36000");
      assert.equal(btc.available.toString(), "1.5");
      assert.equal(position.quantity.toString(), "1.5");
      assert.equal(position.averageCostUsd.toString(), "55000");
      assert.equal(position.realizedPnlUsd.toString(), "7520");
      assert.deepEqual(
        {
          avgFillPrice: order.avgFillPrice?.toString(),
          filledQuantity: order.filledQuantity.toString(),
          quantity: order.quantity.toString(),
          side: order.side,
          status: order.status,
          type: order.type,
        },
        {
          avgFillPrice: "70000",
          filledQuantity: "0.5",
          quantity: "0.5",
          side: "SELL",
          status: "FILLED",
          type: "MARKET",
        },
      );
      assert.deepEqual(
        {
          orderId: trade.orderId,
          price: trade.price.toString(),
          quantity: trade.quantity.toString(),
          quoteAmount: trade.quoteAmount.toString(),
          side: trade.side,
        },
        {
          orderId: execution.orderId,
          price: "70000",
          quantity: "0.5",
          quoteAmount: "35000",
          side: "SELL",
        },
      );
    },
  );

  await t.test("does not create partial state when available BTC is insufficient", async () => {
    await assert.rejects(
      service.execute({ quantity: "2", symbol: "BTC-USD", userId: user.id }),
      (error) => error instanceof MarketOrderError && error.code === "INSUFFICIENT_BALANCE",
    );
    assert.equal(await client.order.count({ where: { userId: user.id } }), 1);
    assert.equal(await client.trade.count({ where: { userId: user.id } }), 1);
    const [usd, btc, position] = await Promise.all([
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "USD", userId: user.id } },
      }),
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: user.id } },
      }),
      client.position.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: user.id } },
      }),
    ]);
    assert.equal(usd.available.toString(), "36000");
    assert.equal(btc.available.toString(), "1.5");
    assert.equal(position.quantity.toString(), "1.5");
  });

  await t.test("allows only one of two concurrent sales to spend the same BTC", async () => {
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
          averageCostUsd: "5000",
          quantity: "1",
          realizedPnlUsd: "0",
          userId: concurrentUser.id,
        },
      }),
    ]);
    const concurrentService = new MarketSellService(
      { client },
      { getTicker: () => ({ price: "6000" }) },
    );

    const results = await Promise.allSettled([
      concurrentService.execute({ quantity: "1", symbol: "BTC-USD", userId: concurrentUser.id }),
      concurrentService.execute({ quantity: "1", symbol: "BTC-USD", userId: concurrentUser.id }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result) => result.status === "rejected");
    assert.equal(rejection?.reason instanceof MarketOrderError, true);
    assert.equal(rejection?.reason.code, "INSUFFICIENT_BALANCE");

    const [usd, btc, position, orderCount, tradeCount] = await Promise.all([
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "USD", userId: concurrentUser.id } },
      }),
      client.walletBalance.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: concurrentUser.id } },
      }),
      client.position.findUniqueOrThrow({
        where: { userId_asset: { asset: "BTC", userId: concurrentUser.id } },
      }),
      client.order.count({ where: { userId: concurrentUser.id } }),
      client.trade.count({ where: { userId: concurrentUser.id } }),
    ]);
    assert.equal(usd.available.toString(), "6000");
    assert.equal(btc.available.toString(), "0");
    assert.equal(position.quantity.toString(), "0");
    assert.equal(position.averageCostUsd.toString(), "0");
    assert.equal(position.realizedPnlUsd.toString(), "1000");
    assert.equal(orderCount, 1);
    assert.equal(tradeCount, 1);
  });
});
