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
const { LimitSellService } = require("../../dist/trading/limit-sell.service.js");
const { OrderCancellationError } = require("../../dist/trading/order-cancellation.error.js");
const { OrderCancellationService } = require("../../dist/trading/order-cancellation.service.js");

test("cancelling BUY and SELL limit orders releases persisted reservations", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `limit-cancel-${randomUUID()}`;
  const emails = [`${prefix}@example.com`, `${prefix}-other@example.com`];

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

  const buyService = new LimitBuyService({ client });
  const cancellationService = new OrderCancellationService({ client });
  const sellService = new LimitSellService({ client });
  const [user, otherUser] = await Promise.all([
    client.user.create({
      data: { email: emails[0], passwordHash: "not-used-by-this-transaction-test" },
    }),
    client.user.create({
      data: { email: emails[1], passwordHash: "not-used-by-this-transaction-test" },
    }),
  ]);
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
        averageCostUsd: "80",
        quantity: "2",
        realizedPnlUsd: "5",
        userId: user.id,
      },
    }),
  ]);

  const buy = await buyService.reserve({
    limitPrice: "100",
    quantity: "1",
    symbol: "BTC-USD",
    userId: user.id,
  });
  await assert.rejects(
    cancellationService.cancel(buy.orderId, otherUser.id),
    (error) => error instanceof OrderCancellationError && error.code === "ORDER_NOT_FOUND",
  );
  await cancellationService.cancel(buy.orderId, user.id);

  const [usd, buyOrder] = await Promise.all([
    findWallet(client, user.id, "USD"),
    client.order.findUniqueOrThrow({ where: { id: buy.orderId } }),
  ]);
  assert.deepEqual(balance(usd), { available: "1000", locked: "0" });
  assert.equal(buyOrder.status, "CANCELLED");
  assert.ok(buyOrder.cancelledAt instanceof Date);
  await assert.rejects(
    cancellationService.cancel(buy.orderId, user.id),
    (error) => error instanceof OrderCancellationError && error.code === "ORDER_NOT_CANCELLABLE",
  );

  const sell = await sellService.reserve({
    limitPrice: "110",
    quantity: "0.5",
    symbol: "BTC-USD",
    userId: user.id,
  });
  await cancellationService.cancel(sell.orderId, user.id);

  const [btc, position, sellOrder, tradeCount] = await Promise.all([
    findWallet(client, user.id, "BTC"),
    client.position.findUniqueOrThrow({
      where: { userId_asset: { asset: "BTC", userId: user.id } },
    }),
    client.order.findUniqueOrThrow({ where: { id: sell.orderId } }),
    client.trade.count({ where: { userId: user.id } }),
  ]);
  assert.deepEqual(balance(btc), { available: "2", locked: "0" });
  assert.deepEqual(
    {
      averageCostUsd: position.averageCostUsd.toString(),
      quantity: position.quantity.toString(),
      realizedPnlUsd: position.realizedPnlUsd.toString(),
    },
    { averageCostUsd: "80", quantity: "2", realizedPnlUsd: "5" },
  );
  assert.equal(sellOrder.status, "CANCELLED");
  assert.ok(sellOrder.cancelledAt instanceof Date);
  assert.equal(tradeCount, 0);
});

function findWallet(client, userId, asset) {
  return client.walletBalance.findUniqueOrThrow({
    where: { userId_asset: { asset, userId } },
  });
}

function balance(wallet) {
  return {
    available: wallet.available.toString(),
    locked: wallet.locked.toString(),
  };
}
