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
const { LimitOrderFillService } = require("../../dist/trading/limit-order-fill.service.js");

test("two evaluators cannot fill the same pending order twice", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const email = `limit-double-fill-${randomUUID()}@example.com`;

  t.after(async () => {
    try {
      await client.$transaction([
        client.trade.deleteMany({ where: { user: { email } } }),
        client.order.deleteMany({ where: { user: { email } } }),
        client.position.deleteMany({ where: { user: { email } } }),
        client.walletBalance.deleteMany({ where: { user: { email } } }),
        client.user.deleteMany({ where: { email } }),
      ]);
    } finally {
      await app.close();
    }
  });

  const buyService = new LimitBuyService({ client });
  const fillService = new LimitOrderFillService({ client }, { onEligibleOrder: () => () => {} });
  const user = await client.user.create({
    data: { email, passwordHash: "not-used-by-this-concurrency-test" },
  });
  await client.walletBalance.create({
    data: { asset: "USD", available: "1000", locked: "0", userId: user.id },
  });
  const reservation = await buyService.reserve({
    limitPrice: "100",
    quantity: "1",
    symbol: "BTC-USD",
    userId: user.id,
  });
  const candidate = {
    limitPrice: "100",
    marketPrice: "90",
    marketTs: Date.now(),
    orderId: reservation.orderId,
    side: "BUY",
    symbol: "BTC-USD",
  };

  const results = await Promise.all([fillService.fill(candidate), fillService.fill(candidate)]);

  assert.equal(results.filter((result) => result !== undefined).length, 1);
  assert.equal(results.filter((result) => result === undefined).length, 1);
  assert.equal(await fillService.fill(candidate), undefined);

  const [usd, btc, position, order, trades] = await Promise.all([
    findWallet(client, user.id, "USD"),
    findWallet(client, user.id, "BTC"),
    client.position.findUniqueOrThrow({
      where: { userId_asset: { asset: "BTC", userId: user.id } },
    }),
    client.order.findUniqueOrThrow({ where: { id: reservation.orderId } }),
    client.trade.findMany({ where: { orderId: reservation.orderId } }),
  ]);

  assert.deepEqual(balance(usd), { available: "910", locked: "0" });
  assert.deepEqual(balance(btc), { available: "1", locked: "0" });
  assert.deepEqual(
    {
      averageCostUsd: position.averageCostUsd.toString(),
      quantity: position.quantity.toString(),
      realizedPnlUsd: position.realizedPnlUsd.toString(),
    },
    { averageCostUsd: "90", quantity: "1", realizedPnlUsd: "0" },
  );
  assert.equal(order.status, "FILLED");
  assert.equal(order.filledQuantity.toString(), "1");
  assert.equal(order.avgFillPrice?.toString(), "90");
  assert.equal(trades.length, 1);
  assert.equal(trades[0].quoteAmount.toString(), "90");
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
