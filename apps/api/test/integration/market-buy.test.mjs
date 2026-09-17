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
const { MarketBuyError, MarketBuyService } = require("../../dist/trading/market-buy.service.js");

test("market BUY persists one atomic fill and concurrent orders cannot overspend", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `market-buy-${randomUUID()}`;
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

  const tickerCache = { getTicker: () => ({ price: "67542.31" }) };
  const service = new MarketBuyService({ client }, tickerCache);
  const user = await client.user.create({
    data: { email: emails[0], passwordHash: "not-used-by-this-transaction-test" },
  });
  await client.walletBalance.create({
    data: { asset: "USD", available: "10000", locked: "0", userId: user.id },
  });

  await t.test(
    "records the filled order, immutable trade, balances, and weighted cost basis",
    async () => {
      const execution = await service.execute({
        quantity: "0.01",
        symbol: "BTC-USD",
        userId: user.id,
      });
      assert.equal(execution.quoteAmount, "675.4231");

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
      assert.equal(usd.available.toString(), "9324.5769");
      assert.equal(usd.locked.toString(), "0");
      assert.equal(btc.available.toString(), "0.01");
      assert.equal(position.quantity.toString(), "0.01");
      assert.equal(position.averageCostUsd.toString(), "67542.31");
      assert.equal(position.realizedPnlUsd.toString(), "0");
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
          avgFillPrice: "67542.31",
          filledQuantity: "0.01",
          quantity: "0.01",
          side: "BUY",
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
          price: "67542.31",
          quantity: "0.01",
          quoteAmount: "675.4231",
          side: "BUY",
        },
      );
    },
  );

  await t.test("does not create partial state when available USD is insufficient", async () => {
    await assert.rejects(
      service.execute({ quantity: "1", symbol: "BTC-USD", userId: user.id }),
      (error) => error instanceof MarketBuyError && error.code === "INSUFFICIENT_BALANCE",
    );
    assert.equal(await client.order.count({ where: { userId: user.id } }), 1);
    assert.equal(await client.trade.count({ where: { userId: user.id } }), 1);
    assert.equal(await client.walletBalance.count({ where: { asset: "BTC", userId: user.id } }), 1);
  });

  await t.test("allows only one of two concurrent purchases to spend the same USD", async () => {
    const concurrentUser = await client.user.create({
      data: { email: emails[1], passwordHash: "not-used-by-this-transaction-test" },
    });
    await client.walletBalance.create({
      data: { asset: "USD", available: "10000", locked: "0", userId: concurrentUser.id },
    });
    const concurrentService = new MarketBuyService(
      { client },
      { getTicker: () => ({ price: "6000" }) },
    );

    const results = await Promise.allSettled([
      concurrentService.execute({ quantity: "1", symbol: "BTC-USD", userId: concurrentUser.id }),
      concurrentService.execute({ quantity: "1", symbol: "BTC-USD", userId: concurrentUser.id }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result) => result.status === "rejected");
    assert.equal(rejection?.reason instanceof MarketBuyError, true);
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
    assert.equal(usd.available.toString(), "4000");
    assert.equal(btc.available.toString(), "1");
    assert.equal(position.quantity.toString(), "1");
    assert.equal(orderCount, 1);
    assert.equal(tradeCount, 1);
  });
});
