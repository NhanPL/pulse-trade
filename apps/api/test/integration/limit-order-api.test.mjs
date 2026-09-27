import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { Module } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const {
  cancelOrderResponseSchema,
  limitBuyOrderResponseSchema,
  limitSellOrderResponseSchema,
} = require("@pulse-trade/contracts");
const { AuthModule } = require("../../dist/auth/auth.module.js");
const { configureHttpApplication } = require("../../dist/config/http-application.js");
const { DatabaseModule } = require("../../dist/database/database.module.js");
const { PrismaService } = require("../../dist/database/prisma.service.js");
const { LimitBuyService } = require("../../dist/trading/limit-buy.service.js");
const { LimitOrderFillService } = require("../../dist/trading/limit-order-fill.service.js");
const { LimitSellService } = require("../../dist/trading/limit-sell.service.js");
const { MarketBuyService } = require("../../dist/trading/market-buy.service.js");
const { MarketSellService } = require("../../dist/trading/market-sell.service.js");
const { OrderCancellationService } = require("../../dist/trading/order-cancellation.service.js");
const { OrdersController } = require("../../dist/trading/orders.controller.js");
const { OrdersQueryService } = require("../../dist/trading/orders-query.service.js");

class LimitOrderApiTestModule {}

Module({
  controllers: [OrdersController],
  imports: [AuthModule, DatabaseModule],
  providers: [
    LimitBuyService,
    LimitSellService,
    OrderCancellationService,
    {
      provide: MarketBuyService,
      useValue: { execute: () => assert.fail("limit-order tests must not execute a market BUY") },
    },
    {
      provide: MarketSellService,
      useValue: { execute: () => assert.fail("limit-order tests must not execute a market SELL") },
    },
    { provide: OrdersQueryService, useValue: {} },
  ],
})(LimitOrderApiTestModule);

test("authenticated limit orders reserve, fill, and cancel against PostgreSQL", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );

  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
  const app = await NestFactory.create(LimitOrderApiTestModule, { logger: false });
  const client = app.get(PrismaService).client;
  const email = `limit-order-api-${randomUUID()}@example.com`;
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  t.after(async () => {
    try {
      await client.$transaction([
        client.trade.deleteMany({ where: { user: { email } } }),
        client.order.deleteMany({ where: { user: { email } } }),
        client.position.deleteMany({ where: { user: { email } } }),
        client.session.deleteMany({ where: { user: { email } } }),
        client.walletBalance.deleteMany({ where: { user: { email } } }),
        client.user.deleteMany({ where: { email } }),
      ]);
    } finally {
      await app.close();
      if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  configureHttpApplication(app, { nodeEnv: "test", port: 3001, webOrigin: origin });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `${await app.getUrl()}/api/v1`;
  const post = (path, body, accessToken) =>
    globalThis.fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const register = await post("/auth/register", {
    email,
    password: "limit-order-password",
  });
  assert.equal(register.status, 201);
  const login = await globalThis.fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "User-Agent": "limit-order-integration-test",
    },
    body: JSON.stringify({ email, password: "limit-order-password" }),
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  const accessToken = loginBody.data.accessToken;
  const userId = loginBody.data.user.id;

  await t.test(
    "rejects unauthenticated, invalid, and unaffordable orders without mutations",
    async () => {
      const validOrder = limitOrder("BUY", "1", "100");
      const unauthorized = await post("/orders", validOrder);
      assert.equal(unauthorized.status, 401);
      assert.equal((await unauthorized.json()).error.code, "UNAUTHENTICATED");

      const invalid = await post("/orders", { ...validOrder, limitPrice: "0" }, accessToken);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, "INVALID_LIMIT_PRICE");

      const unaffordable = await post("/orders", limitOrder("BUY", "2", "10000"), accessToken);
      assert.equal(unaffordable.status, 409);
      assert.equal((await unaffordable.json()).error.code, "INSUFFICIENT_BALANCE");
      assert.equal(await client.order.count({ where: { userId } }), 0);
      assert.deepEqual(await findBalance(client, userId, "USD"), {
        available: "10000",
        locked: "0",
      });
    },
  );

  await t.test("LIMIT BUY locks quote funds and fills with price improvement", async () => {
    const response = await post("/orders", limitOrder("BUY", "2", "100"), accessToken);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    limitBuyOrderResponseSchema.parse(body);
    assert.deepEqual(
      { ...body.data, id: "order-id" },
      {
        id: "order-id",
        limitPrice: "100",
        quantity: "2",
        side: "BUY",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
      },
    );
    assert.deepEqual(await findBalance(client, userId, "USD"), {
      available: "9800",
      locked: "200",
    });

    const fillService = new LimitOrderFillService(
      { client },
      { onEligibleOrder: () => () => undefined },
    );
    const fill = await fillService.fill({
      limitPrice: "100",
      marketPrice: "90",
      marketTs: Date.now(),
      orderId: body.data.id,
      side: "BUY",
      symbol: "BTC-USD",
    });
    assert.equal(fill?.quoteAmount, "180");

    const [usd, btc, position, order, trade] = await Promise.all([
      findBalance(client, userId, "USD"),
      findBalance(client, userId, "BTC"),
      findPosition(client, userId, "BTC"),
      client.order.findUniqueOrThrow({ where: { id: body.data.id } }),
      client.trade.findFirstOrThrow({ where: { orderId: body.data.id } }),
    ]);
    assert.deepEqual(usd, { available: "9820", locked: "0" });
    assert.deepEqual(btc, { available: "2", locked: "0" });
    assert.deepEqual(position, {
      averageCostUsd: "90",
      quantity: "2",
      realizedPnlUsd: "0",
    });
    assert.equal(order.status, "FILLED");
    assert.equal(order.avgFillPrice?.toString(), "90");
    assert.equal(trade.quoteAmount.toString(), "180");
  });

  await t.test("LIMIT SELL locks base assets and fills atomically", async () => {
    const response = await post("/orders", limitOrder("SELL", "0.5", "110"), accessToken);
    assert.equal(response.status, 201);
    const body = await response.json();
    limitSellOrderResponseSchema.parse(body);
    assert.deepEqual(await findBalance(client, userId, "BTC"), {
      available: "1.5",
      locked: "0.5",
    });

    const fillService = new LimitOrderFillService(
      { client },
      { onEligibleOrder: () => () => undefined },
    );
    const fill = await fillService.fill({
      limitPrice: "110",
      marketPrice: "120",
      marketTs: Date.now(),
      orderId: body.data.id,
      side: "SELL",
      symbol: "BTC-USD",
    });
    assert.equal(fill?.quoteAmount, "60");

    const [usd, btc, position, order] = await Promise.all([
      findBalance(client, userId, "USD"),
      findBalance(client, userId, "BTC"),
      findPosition(client, userId, "BTC"),
      client.order.findUniqueOrThrow({ where: { id: body.data.id } }),
    ]);
    assert.deepEqual(usd, { available: "9880", locked: "0" });
    assert.deepEqual(btc, { available: "1.5", locked: "0" });
    assert.deepEqual(position, {
      averageCostUsd: "90",
      quantity: "1.5",
      realizedPnlUsd: "15",
    });
    assert.equal(order.status, "FILLED");
    assert.equal(order.avgFillPrice?.toString(), "120");
  });

  await t.test("cancellation releases BUY and SELL reservations exactly once", async () => {
    const scenarios = [
      {
        asset: "USD",
        before: { available: "9800", locked: "80" },
        order: limitOrder("BUY", "1", "80"),
        restored: { available: "9880", locked: "0" },
      },
      {
        asset: "BTC",
        before: { available: "1.25", locked: "0.25" },
        order: limitOrder("SELL", "0.25", "130"),
        restored: { available: "1.5", locked: "0" },
      },
    ];

    for (const scenario of scenarios) {
      const create = await post("/orders", scenario.order, accessToken);
      assert.equal(create.status, 201);
      const created = await create.json();
      assert.deepEqual(await findBalance(client, userId, scenario.asset), scenario.before);

      const cancel = await post(`/orders/${created.data.id}/cancel`, {}, accessToken);
      assert.equal(cancel.status, 200);
      const cancelled = await cancel.json();
      cancelOrderResponseSchema.parse(cancelled);
      assert.equal(cancelled.data.id, created.data.id);
      assert.equal(cancelled.data.status, "CANCELLED");
      assert.deepEqual(await findBalance(client, userId, scenario.asset), scenario.restored);

      const retry = await post(`/orders/${created.data.id}/cancel`, {}, accessToken);
      assert.equal(retry.status, 409);
      assert.equal((await retry.json()).error.code, "ORDER_NOT_CANCELLABLE");
      assert.deepEqual(await findBalance(client, userId, scenario.asset), scenario.restored);
    }

    assert.equal(await client.trade.count({ where: { userId } }), 2);
    assert.equal(await client.order.count({ where: { status: "CANCELLED", userId } }), 2);
    assert.equal(await client.order.count({ where: { status: "FILLED", userId } }), 2);
  });
});

function limitOrder(side, quantity, limitPrice) {
  return { limitPrice, quantity, side, symbol: "BTC-USD", type: "LIMIT" };
}

async function findBalance(client, userId, asset) {
  const wallet = await client.walletBalance.findUniqueOrThrow({
    where: { userId_asset: { asset, userId } },
  });
  return { available: wallet.available.toString(), locked: wallet.locked.toString() };
}

async function findPosition(client, userId, asset) {
  const position = await client.position.findUniqueOrThrow({
    where: { userId_asset: { asset, userId } },
  });
  return {
    averageCostUsd: position.averageCostUsd.toString(),
    quantity: position.quantity.toString(),
    realizedPnlUsd: position.realizedPnlUsd.toString(),
  };
}
