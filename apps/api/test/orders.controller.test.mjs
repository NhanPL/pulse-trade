import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  cancelOrderParamsSchema,
  cancelOrderResponseSchema,
  limitBuyOrderRequestSchema,
  limitBuyOrderResponseSchema,
  limitSellOrderRequestSchema,
  limitSellOrderResponseSchema,
  marketOrderRequestSchema,
  marketOrderResponseSchema,
  ordersListQuerySchema,
  ordersListResponseSchema,
} = require("@pulse-trade/contracts");
const { UnauthorizedException } = require("@nestjs/common");
const { MarketOrderError } = require("../dist/trading/market-order.error.js");
const { OrderCancellationError } = require("../dist/trading/order-cancellation.error.js");
const { OrdersController } = require("../dist/trading/orders.controller.js");
const { OrdersQueryError } = require("../dist/trading/orders-query.error.js");

const user = { email: "trader@example.com", id: randomUUID() };
const limitOrderId = randomUUID();
const limitSellOrderId = randomUUID();

function execution({ price = "67542.31", quantity = "0.01", symbol = "BTC-USD" } = {}) {
  return {
    executionPrice: price,
    executedAt: new Date(),
    orderId: randomUUID(),
    quantity,
    quoteAmount: "675.4231",
    symbol,
    tradeId: randomUUID(),
  };
}

function createController({
  buy,
  cancellation,
  currentUser,
  limitBuy,
  limitSell,
  ordersQuery,
  sell,
} = {}) {
  return new OrdersController(
    currentUser ?? {
      async resolve() {
        return user;
      },
    },
    buy ?? {
      async execute() {
        return execution();
      },
    },
    sell ?? {
      async execute() {
        return execution();
      },
    },
    limitBuy ?? {
      async reserve() {
        return {
          limitPrice: "65000",
          orderId: limitOrderId,
          quantity: "0.01",
          reservedAmount: "650",
          reservedAsset: "USD",
          symbol: "BTC-USD",
        };
      },
    },
    limitSell ?? {
      async reserve() {
        return {
          limitPrice: "70000",
          orderId: limitSellOrderId,
          quantity: "0.5",
          reservedAmount: "0.5",
          reservedAsset: "BTC",
          symbol: "BTC-USD",
        };
      },
    },
    cancellation ?? {
      async cancel(orderId) {
        return { cancelledAt: new Date(), orderId, releasedAmount: "650", releasedAsset: "USD" };
      },
    },
    ordersQuery ?? {
      async list() {
        return { items: [], nextCursor: null };
      },
    },
  );
}

test("orders-list contracts validate filters, pagination, and financial strings", () => {
  assert.deepEqual(ordersListQuerySchema.parse({}), { limit: 20 });
  assert.deepEqual(
    ordersListQuerySchema.parse({
      cursor: limitOrderId,
      limit: "50",
      side: "BUY",
      status: "PENDING",
      symbol: "BTC-USD",
    }),
    {
      cursor: limitOrderId,
      limit: 50,
      side: "BUY",
      status: "PENDING",
      symbol: "BTC-USD",
    },
  );

  const item = {
    avgFillPrice: null,
    cancelledAt: null,
    createdAt: "2026-09-27T00:00:00.000Z",
    filledAt: null,
    filledQuantity: "0",
    id: limitOrderId,
    limitPrice: "65000",
    quantity: "0.01",
    side: "BUY",
    status: "PENDING",
    symbol: "BTC-USD",
    type: "LIMIT",
  };
  assert.deepEqual(
    ordersListResponseSchema.parse({ data: { items: [item], nextCursor: limitOrderId } }),
    { data: { items: [item], nextCursor: limitOrderId } },
  );

  for (const query of [
    { limit: "0" },
    { limit: "101" },
    { limit: "2.5" },
    { cursor: "not-a-uuid" },
    { side: "HOLD" },
    { status: "OPEN" },
    { symbol: "btc-usd" },
    { injected: "true" },
  ]) {
    assert.equal(ordersListQuerySchema.safeParse(query).success, false);
  }
  assert.equal(
    ordersListResponseSchema.safeParse({
      data: { items: [{ ...item, quantity: 0.01 }], nextCursor: null },
    }).success,
    false,
  );
});

test("lists only the authenticated user's orders with validated query parameters", async () => {
  const calls = [];
  const controller = createController({
    currentUser: {
      async resolve(authorization) {
        calls.push({ authorization, operation: "authenticate" });
        return user;
      },
    },
    ordersQuery: {
      async list(userId, query) {
        calls.push({ operation: "list", query, userId });
        return { items: [], nextCursor: null };
      },
    },
  });

  assert.deepEqual(
    await controller.listOrders(
      { limit: "10", side: "SELL", status: "FILLED", symbol: "ETH-USD" },
      "Bearer access-token",
    ),
    { data: { items: [], nextCursor: null } },
  );
  assert.deepEqual(calls, [
    { authorization: "Bearer access-token", operation: "authenticate" },
    {
      operation: "list",
      query: { limit: 10, side: "SELL", status: "FILLED", symbol: "ETH-USD" },
      userId: user.id,
    },
  ]);
});

test("rejects invalid list queries and cursors without leaking persistence details", async () => {
  let listCalls = 0;
  const invalid = createController({
    ordersQuery: {
      list() {
        listCalls++;
        assert.fail("must not query orders with invalid input");
      },
    },
  });
  await assert.rejects(invalid.listOrders({ limit: "0" }), (error) => {
    assert.equal(error.getStatus(), 400);
    assert.equal(error.getResponse().error.code, "INVALID_ORDERS_QUERY");
    return true;
  });
  assert.equal(listCalls, 0);

  const invalidCursor = createController({
    ordersQuery: {
      async list() {
        throw new OrdersQueryError("private cursor ownership detail");
      },
    },
  });
  await assert.rejects(invalidCursor.listOrders({ cursor: limitOrderId }), (error) => {
    assert.equal(error.getStatus(), 400);
    assert.equal(error.getResponse().error.code, "INVALID_CURSOR");
    assert.equal(JSON.stringify(error.getResponse()).includes("ownership"), false);
    return true;
  });
});

test("cancel-order contracts validate UUID params and cancelled responses", () => {
  assert.deepEqual(cancelOrderParamsSchema.parse({ id: limitOrderId }), { id: limitOrderId });
  assert.equal(cancelOrderParamsSchema.safeParse({ id: "not-a-uuid" }).success, false);
  assert.equal(
    cancelOrderResponseSchema.safeParse({
      data: {
        cancelledAt: "2026-09-26T00:00:00.000Z",
        id: limitOrderId,
        status: "CANCELLED",
      },
    }).success,
    true,
  );
});

test("cancels only the authenticated user's order", async () => {
  const cancelledAt = new Date("2026-09-26T00:00:00.000Z");
  const controller = createController({
    cancellation: {
      async cancel(orderId, userId) {
        assert.equal(orderId, limitOrderId);
        assert.equal(userId, user.id);
        return { cancelledAt, orderId, releasedAmount: "650", releasedAsset: "USD" };
      },
    },
    currentUser: {
      async resolve(authorization) {
        assert.equal(authorization, "Bearer access-token");
        return user;
      },
    },
  });

  assert.deepEqual(await controller.cancelOrder(limitOrderId, "Bearer access-token"), {
    data: {
      cancelledAt: "2026-09-26T00:00:00.000Z",
      id: limitOrderId,
      status: "CANCELLED",
    },
  });
});

test("maps invalid, missing, and non-cancellable orders to stable HTTP errors", async () => {
  let calls = 0;
  const invalid = createController({
    cancellation: {
      cancel() {
        calls++;
        assert.fail("must not submit an invalid order id");
      },
    },
  });
  await assert.rejects(invalid.cancelOrder("not-a-uuid"), (error) => {
    assert.equal(error.getStatus(), 404);
    assert.equal(error.getResponse().error.code, "ORDER_NOT_FOUND");
    return true;
  });
  assert.equal(calls, 0);

  for (const [code, status] of [
    ["ORDER_NOT_FOUND", 404],
    ["ORDER_NOT_CANCELLABLE", 409],
  ]) {
    const controller = createController({
      cancellation: {
        async cancel() {
          throw new OrderCancellationError(code, "private persistence detail");
        },
      },
    });
    await assert.rejects(controller.cancelOrder(limitOrderId), (error) => {
      assert.equal(error.getStatus(), status);
      assert.equal(error.getResponse().error.code, code);
      assert.equal(JSON.stringify(error.getResponse()).includes("persistence"), false);
      return true;
    });
  }
});

test("market-order contracts accept only strict MARKET BUY/SELL payloads and response data", () => {
  const request = { quantity: "0.01", side: "BUY", symbol: "BTC-USD", type: "MARKET" };
  assert.deepEqual(marketOrderRequestSchema.parse(request), request);
  assert.equal(
    marketOrderResponseSchema.safeParse({
      data: {
        avgFillPrice: "67542.31",
        id: randomUUID(),
        quantity: "0.01",
        side: "BUY",
        status: "FILLED",
        symbol: "BTC-USD",
        type: "MARKET",
      },
    }).success,
    true,
  );

  for (const invalid of [
    { ...request, quantity: "0" },
    { ...request, quantity: "0.000" },
    { ...request, quantity: "0.1e1" },
    { ...request, side: "HOLD" },
    { ...request, symbol: "btc-usd" },
    { ...request, type: "LIMIT" },
    { ...request, userId: randomUUID() },
  ]) {
    assert.equal(marketOrderRequestSchema.safeParse(invalid).success, false);
  }
});

test("limit-BUY contracts accept only strict positive LIMIT payloads and pending responses", () => {
  const request = {
    limitPrice: "65000",
    quantity: "0.01",
    side: "BUY",
    symbol: "BTC-USD",
    type: "LIMIT",
  };
  assert.deepEqual(limitBuyOrderRequestSchema.parse(request), request);
  assert.equal(
    limitBuyOrderResponseSchema.safeParse({
      data: {
        id: randomUUID(),
        limitPrice: "65000",
        quantity: "0.01",
        side: "BUY",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
      },
    }).success,
    true,
  );

  for (const invalid of [
    { ...request, limitPrice: "0" },
    { ...request, limitPrice: "1e3" },
    { ...request, quantity: "0" },
    { ...request, side: "SELL" },
    { ...request, type: "MARKET" },
    { ...request, userId: randomUUID() },
  ]) {
    assert.equal(limitBuyOrderRequestSchema.safeParse(invalid).success, false);
  }
});

test("limit-SELL contracts accept only strict positive LIMIT payloads and pending responses", () => {
  const request = {
    limitPrice: "70000",
    quantity: "0.5",
    side: "SELL",
    symbol: "BTC-USD",
    type: "LIMIT",
  };
  assert.deepEqual(limitSellOrderRequestSchema.parse(request), request);
  assert.equal(
    limitSellOrderResponseSchema.safeParse({
      data: {
        id: randomUUID(),
        limitPrice: "70000",
        quantity: "0.5",
        side: "SELL",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
      },
    }).success,
    true,
  );

  for (const invalid of [
    { ...request, limitPrice: "0" },
    { ...request, limitPrice: "1e3" },
    { ...request, quantity: "0" },
    { ...request, side: "BUY" },
    { ...request, type: "MARKET" },
    { ...request, userId: randomUUID() },
  ]) {
    assert.equal(limitSellOrderRequestSchema.safeParse(invalid).success, false);
  }
});

test("creates a filled market BUY for the authenticated user only", async () => {
  const filled = execution();
  const controller = createController({
    buy: {
      async execute(input) {
        assert.deepEqual(input, { quantity: "0.01", symbol: "BTC-USD", userId: user.id });
        return filled;
      },
    },
    currentUser: {
      async resolve(authorization) {
        assert.equal(authorization, "Bearer access-token");
        return user;
      },
    },
    sell: {
      execute() {
        assert.fail("must not execute a sell");
      },
    },
  });

  assert.deepEqual(
    await controller.createOrder(
      { quantity: "0.01", side: "BUY", symbol: "BTC-USD", type: "MARKET" },
      "Bearer access-token",
    ),
    {
      data: {
        avgFillPrice: "67542.31",
        id: filled.orderId,
        quantity: "0.01",
        side: "BUY",
        status: "FILLED",
        symbol: "BTC-USD",
        type: "MARKET",
      },
    },
  );
});

test("creates a filled market SELL through the sell transaction service", async () => {
  const filled = execution({ price: "70000", quantity: "0.5" });
  const controller = createController({
    buy: {
      execute() {
        assert.fail("must not execute a buy");
      },
    },
    sell: {
      async execute(input) {
        assert.deepEqual(input, { quantity: "0.5", symbol: "BTC-USD", userId: user.id });
        return filled;
      },
    },
  });

  const response = await controller.createOrder({
    quantity: "0.5",
    side: "SELL",
    symbol: "BTC-USD",
    type: "MARKET",
  });
  assert.equal(response.data.side, "SELL");
  assert.equal(response.data.avgFillPrice, "70000");
});

test("creates a pending limit BUY through the reservation service", async () => {
  const controller = createController({
    buy: {
      execute() {
        assert.fail("must not execute a market buy");
      },
    },
    limitBuy: {
      async reserve(input) {
        assert.deepEqual(input, {
          limitPrice: "65000",
          quantity: "0.01",
          symbol: "BTC-USD",
          userId: user.id,
        });
        return {
          limitPrice: "65000",
          orderId: limitOrderId,
          quantity: "0.01",
          reservedAmount: "650",
          reservedAsset: "USD",
          symbol: "BTC-USD",
        };
      },
    },
    sell: {
      execute() {
        assert.fail("must not execute a market sell");
      },
    },
  });

  assert.deepEqual(
    await controller.createOrder({
      limitPrice: "65000",
      quantity: "0.01",
      side: "BUY",
      symbol: "BTC-USD",
      type: "LIMIT",
    }),
    {
      data: {
        id: limitOrderId,
        limitPrice: "65000",
        quantity: "0.01",
        side: "BUY",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
      },
    },
  );
});

test("creates a pending limit SELL through the reservation service", async () => {
  const controller = createController({
    buy: {
      execute() {
        assert.fail("must not execute a market buy");
      },
    },
    limitBuy: {
      reserve() {
        assert.fail("must not reserve a limit buy");
      },
    },
    limitSell: {
      async reserve(input) {
        assert.deepEqual(input, {
          limitPrice: "70000",
          quantity: "0.5",
          symbol: "BTC-USD",
          userId: user.id,
        });
        return {
          limitPrice: "70000",
          orderId: limitSellOrderId,
          quantity: "0.5",
          reservedAmount: "0.5",
          reservedAsset: "BTC",
          symbol: "BTC-USD",
        };
      },
    },
    sell: {
      execute() {
        assert.fail("must not execute a market sell");
      },
    },
  });

  assert.deepEqual(
    await controller.createOrder({
      limitPrice: "70000",
      quantity: "0.5",
      side: "SELL",
      symbol: "BTC-USD",
      type: "LIMIT",
    }),
    {
      data: {
        id: limitSellOrderId,
        limitPrice: "70000",
        quantity: "0.5",
        side: "SELL",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
      },
    },
  );
});

test("authenticates before validation and rejects invalid market-order bodies", async () => {
  const controller = createController({
    currentUser: {
      async resolve() {
        throw new UnauthorizedException({
          error: { code: "UNAUTHENTICATED", details: null, message: "Authentication is required." },
        });
      },
    },
  });
  await assert.rejects(
    controller.createOrder({ quantity: "0", side: "BUY", symbol: "BTC-USD", type: "MARKET" }),
    (error) => error.getStatus() === 401 && error.getResponse().error.code === "UNAUTHENTICATED",
  );

  const invalidBody = createController({
    buy: {
      execute() {
        assert.fail("must not submit invalid input");
      },
    },
  });
  for (const [body, code] of [
    [{ quantity: "0", side: "BUY", symbol: "BTC-USD", type: "MARKET" }, "INVALID_QUANTITY"],
    [{ quantity: "0.01", side: "BUY", symbol: "BTC-USD", type: "LIMIT" }, "INVALID_LIMIT_PRICE"],
    [
      { limitPrice: "65000", quantity: "0.01", side: "HOLD", symbol: "BTC-USD", type: "LIMIT" },
      "INVALID_ORDER",
    ],
    [
      { quantity: "0.01", side: "BUY", symbol: "BTC-USD", type: "MARKET", userId: user.id },
      "INVALID_ORDER",
    ],
  ]) {
    await assert.rejects(invalidBody.createOrder(body), (error) => {
      assert.equal(error.getStatus(), 400);
      assert.equal(error.getResponse().error.code, code);
      assert.equal(error.getResponse().error.details, null);
      return true;
    });
  }
});

test("maps market-order errors to stable HTTP errors and sanitizes unexpected failures", async () => {
  const cases = [
    ["UNSUPPORTED_SYMBOL", 400],
    ["INVALID_QUANTITY", 400],
    ["INVALID_LIMIT_PRICE", 400],
    ["INSUFFICIENT_BALANCE", 409],
    ["ORDER_CONFLICT", 409],
    ["MARKET_DATA_UNAVAILABLE", 503],
    ["MARKET_DATA_STALE", 503],
  ];
  for (const [code, status] of cases) {
    const controller = createController({
      buy: {
        async execute() {
          throw new MarketOrderError(code, "internal message must not be returned");
        },
      },
    });
    await assert.rejects(
      controller.createOrder({
        quantity: "0.01",
        side: "BUY",
        symbol: "BTC-USD",
        type: "MARKET",
      }),
      (error) => {
        assert.equal(error.getStatus(), status);
        assert.equal(error.getResponse().error.code, code);
        assert.equal(JSON.stringify(error.getResponse()).includes("internal message"), false);
        return true;
      },
    );
  }

  const unavailable = createController({
    buy: {
      async execute() {
        throw new Error("database credential leaked");
      },
    },
  });
  await assert.rejects(
    unavailable.createOrder({
      quantity: "0.01",
      side: "BUY",
      symbol: "BTC-USD",
      type: "MARKET",
    }),
    (error) => {
      assert.equal(error.getStatus(), 503);
      assert.equal(error.getResponse().error.code, "ORDER_UNAVAILABLE");
      assert.equal(JSON.stringify(error.getResponse()).includes("credential"), false);
      return true;
    },
  );
});
