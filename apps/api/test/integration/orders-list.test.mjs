import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
const { Module } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");
const { ordersListResponseSchema } = require("@pulse-trade/contracts");
const { AuthModule } = require("../../dist/auth/auth.module.js");
const { configureHttpApplication } = require("../../dist/config/http-application.js");
const { DatabaseModule } = require("../../dist/database/database.module.js");
const { PrismaService } = require("../../dist/database/prisma.service.js");
const { LimitBuyService } = require("../../dist/trading/limit-buy.service.js");
const { LimitSellService } = require("../../dist/trading/limit-sell.service.js");
const { MarketBuyService } = require("../../dist/trading/market-buy.service.js");
const { MarketSellService } = require("../../dist/trading/market-sell.service.js");
const { OrderCancellationService } = require("../../dist/trading/order-cancellation.service.js");
const { OrdersController } = require("../../dist/trading/orders.controller.js");
const { OrdersQueryService } = require("../../dist/trading/orders-query.service.js");

class OrdersListApiTestModule {}

Module({
  controllers: [OrdersController],
  imports: [AuthModule, DatabaseModule],
  providers: [
    OrdersQueryService,
    { provide: LimitBuyService, useValue: {} },
    { provide: LimitSellService, useValue: {} },
    { provide: MarketBuyService, useValue: {} },
    { provide: MarketSellService, useValue: {} },
    { provide: OrderCancellationService, useValue: {} },
  ],
})(OrdersListApiTestModule);

test("orders endpoint paginates and filters only the authenticated user's orders", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(
    databaseUrl && new URL(databaseUrl).pathname.endsWith("_test"),
    "Use a dedicated DATABASE_URL ending in _test",
  );

  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
  const app = await NestFactory.create(OrdersListApiTestModule, { logger: false });
  const client = app.get(PrismaService).client;
  const prefix = `orders-list-${randomUUID()}`;
  const emails = [`${prefix}@example.com`, `${prefix}-other@example.com`];
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  t.after(async () => {
    try {
      await client.$transaction([
        client.trade.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.order.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.position.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.session.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.walletBalance.deleteMany({ where: { user: { email: { in: emails } } } }),
        client.user.deleteMany({ where: { email: { in: emails } } }),
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
  const postAuth = (route, body) =>
    globalThis.fetch(`${baseUrl}/auth/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  const register = async (email) => {
    const response = await postAuth("register", { email, password: "orders-list-password" });
    assert.equal(response.status, 201);
    return (await response.json()).data.user;
  };
  const primary = await register(emails[0]);
  const other = await register(emails[1]);
  const login = await postAuth("login", {
    email: emails[0],
    password: "orders-list-password",
  });
  assert.equal(login.status, 200);
  const accessToken = (await login.json()).data.accessToken;

  const orderIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const otherOrderId = randomUUID();
  await client.order.createMany({
    data: [
      {
        baseAsset: "BTC",
        createdAt: new Date("2026-09-27T04:00:00.000Z"),
        id: orderIds[0],
        limitPrice: "95",
        quantity: "1",
        quoteAsset: "USD",
        reservedAmount: "95",
        reservedAsset: "USD",
        side: "BUY",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
        userId: primary.id,
      },
      {
        avgFillPrice: "120",
        baseAsset: "ETH",
        createdAt: new Date("2026-09-27T03:00:00.000Z"),
        filledAt: new Date("2026-09-27T03:01:00.000Z"),
        filledQuantity: "0.5",
        id: orderIds[1],
        quantity: "0.5",
        quoteAsset: "USD",
        side: "SELL",
        status: "FILLED",
        symbol: "ETH-USD",
        type: "MARKET",
        userId: primary.id,
      },
      {
        baseAsset: "BTC",
        cancelledAt: new Date("2026-09-27T02:01:00.000Z"),
        createdAt: new Date("2026-09-27T02:00:00.000Z"),
        id: orderIds[2],
        limitPrice: "130",
        quantity: "0.25",
        quoteAsset: "USD",
        reservedAmount: "0.25",
        reservedAsset: "BTC",
        side: "SELL",
        status: "CANCELLED",
        symbol: "BTC-USD",
        type: "LIMIT",
        userId: primary.id,
      },
      {
        baseAsset: "SOL",
        createdAt: new Date("2026-09-27T01:00:00.000Z"),
        id: orderIds[3],
        quantity: "2",
        quoteAsset: "USD",
        rejectionReasonCode: "INSUFFICIENT_BALANCE",
        side: "BUY",
        status: "REJECTED",
        symbol: "SOL-USD",
        type: "MARKET",
        userId: primary.id,
      },
      {
        baseAsset: "BTC",
        createdAt: new Date("2026-09-27T05:00:00.000Z"),
        id: otherOrderId,
        limitPrice: "100",
        quantity: "1",
        quoteAsset: "USD",
        reservedAmount: "100",
        reservedAsset: "USD",
        side: "BUY",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
        userId: other.id,
      },
    ],
  });

  const getOrders = (query = "", token = accessToken) =>
    globalThis.fetch(`${baseUrl}/orders${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  await t.test(
    "uses an exclusive cursor and returns persisted order fields newest first",
    async () => {
      const firstResponse = await getOrders("?limit=2");
      assert.equal(firstResponse.status, 200);
      assert.equal(firstResponse.headers.get("cache-control"), "no-store");
      const first = await firstResponse.json();
      ordersListResponseSchema.parse(first);
      assert.deepEqual(
        first.data.items.map((order) => order.id),
        orderIds.slice(0, 2),
      );
      assert.equal(first.data.nextCursor, orderIds[1]);
      assert.deepEqual(first.data.items[0], {
        avgFillPrice: null,
        cancelledAt: null,
        createdAt: "2026-09-27T04:00:00.000Z",
        filledAt: null,
        filledQuantity: "0",
        id: orderIds[0],
        limitPrice: "95",
        quantity: "1",
        side: "BUY",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
      });

      const secondResponse = await getOrders(`?limit=2&cursor=${first.data.nextCursor}`);
      assert.equal(secondResponse.status, 200);
      const second = await secondResponse.json();
      ordersListResponseSchema.parse(second);
      assert.deepEqual(
        second.data.items.map((order) => order.id),
        orderIds.slice(2),
      );
      assert.equal(second.data.nextCursor, null);
      assert.equal(
        [...first.data.items, ...second.data.items].some(({ id }) => id === otherOrderId),
        false,
      );
    },
  );

  await t.test("combines status, side, and symbol filters", async () => {
    const response = await getOrders("?status=PENDING&side=BUY&symbol=BTC-USD&limit=10");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(
      body.data.items.map((order) => order.id),
      [orderIds[0]],
    );
    assert.equal(body.data.nextCursor, null);
  });

  await t.test("rejects unauthenticated, malformed, unknown, and foreign cursors", async () => {
    const unauthorized = await getOrders("?limit=0", null);
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).error.code, "UNAUTHENTICATED");

    for (const query of ["?limit=0", "?limit=101", "?status=OPEN", "?injected=true"]) {
      const response = await getOrders(query);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "INVALID_ORDERS_QUERY");
    }

    const foreignCursor = await getOrders(`?cursor=${otherOrderId}`);
    assert.equal(foreignCursor.status, 400);
    assert.equal((await foreignCursor.json()).error.code, "INVALID_CURSOR");
  });
});
