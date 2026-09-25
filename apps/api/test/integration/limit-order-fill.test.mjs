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
const { LimitSellService } = require("../../dist/trading/limit-sell.service.js");

test("limit BUY and SELL fills update financial state in one transaction", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );
  const app = await NestFactory.createApplicationContext(DatabaseModule, { logger: false });
  const client = app.get(PrismaService).client;
  const email = `limit-fill-${randomUUID()}@example.com`;

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
  const sellService = new LimitSellService({ client });
  const user = await client.user.create({
    data: { email, passwordHash: "not-used-by-this-transaction-test" },
  });
  await client.walletBalance.create({
    data: { asset: "USD", available: "1000", locked: "0", userId: user.id },
  });

  const buy = await buyService.reserve({
    limitPrice: "100",
    quantity: "1",
    symbol: "BTC-USD",
    userId: user.id,
  });
  const buyFill = await fillService.fill({
    limitPrice: "100",
    marketPrice: "90",
    marketTs: Date.now(),
    orderId: buy.orderId,
    side: "BUY",
    symbol: "BTC-USD",
  });
  assert.equal(buyFill?.quoteAmount, "90");

  const [usdAfterBuy, btcAfterBuy, positionAfterBuy, buyOrder, buyTrade] = await Promise.all([
    findWallet(client, user.id, "USD"),
    findWallet(client, user.id, "BTC"),
    findPosition(client, user.id, "BTC"),
    client.order.findUniqueOrThrow({ where: { id: buy.orderId } }),
    client.trade.findFirstOrThrow({ where: { orderId: buy.orderId } }),
  ]);
  assert.deepEqual(balance(usdAfterBuy), { available: "910", locked: "0" });
  assert.deepEqual(balance(btcAfterBuy), { available: "1", locked: "0" });
  assert.deepEqual(position(positionAfterBuy), {
    averageCostUsd: "90",
    quantity: "1",
    realizedPnlUsd: "0",
  });
  assert.equal(buyOrder.status, "FILLED");
  assert.equal(buyOrder.avgFillPrice?.toString(), "90");
  assert.equal(buyOrder.filledQuantity.toString(), "1");
  assert.equal(buyOrder.reservedAmount.toString(), "100");
  assert.equal(buyTrade.quoteAmount.toString(), "90");

  const sell = await sellService.reserve({
    limitPrice: "100",
    quantity: "0.4",
    symbol: "BTC-USD",
    userId: user.id,
  });
  const sellFill = await fillService.fill({
    limitPrice: "100",
    marketPrice: "110",
    marketTs: Date.now(),
    orderId: sell.orderId,
    side: "SELL",
    symbol: "BTC-USD",
  });
  assert.equal(sellFill?.quoteAmount, "44");

  const [usdAfterSell, btcAfterSell, positionAfterSell, sellOrder, sellTrade] = await Promise.all([
    findWallet(client, user.id, "USD"),
    findWallet(client, user.id, "BTC"),
    findPosition(client, user.id, "BTC"),
    client.order.findUniqueOrThrow({ where: { id: sell.orderId } }),
    client.trade.findFirstOrThrow({ where: { orderId: sell.orderId } }),
  ]);
  assert.deepEqual(balance(usdAfterSell), { available: "954", locked: "0" });
  assert.deepEqual(balance(btcAfterSell), { available: "0.6", locked: "0" });
  assert.deepEqual(position(positionAfterSell), {
    averageCostUsd: "90",
    quantity: "0.6",
    realizedPnlUsd: "8",
  });
  assert.equal(sellOrder.status, "FILLED");
  assert.equal(sellOrder.avgFillPrice?.toString(), "110");
  assert.equal(sellOrder.filledQuantity.toString(), "0.4");
  assert.equal(sellTrade.quoteAmount.toString(), "44");
});

function findWallet(client, userId, asset) {
  return client.walletBalance.findUniqueOrThrow({
    where: { userId_asset: { asset, userId } },
  });
}

function findPosition(client, userId, asset) {
  return client.position.findUniqueOrThrow({
    where: { userId_asset: { asset, userId } },
  });
}

function balance(wallet) {
  return {
    available: wallet.available.toString(),
    locked: wallet.locked.toString(),
  };
}

function position(value) {
  return {
    averageCostUsd: value.averageCostUsd.toString(),
    quantity: value.quantity.toString(),
    realizedPnlUsd: value.realizedPnlUsd.toString(),
  };
}
