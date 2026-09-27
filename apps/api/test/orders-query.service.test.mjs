import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { OrdersQueryError } = require("../dist/trading/orders-query.error.js");
const { OrdersQueryService } = require("../dist/trading/orders-query.service.js");

const userId = randomUUID();

test("returns a bounded newest-first page and serializes database values", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const rows = [
    orderRow({ id: ids[0], createdAt: "2026-09-27T03:00:00.000Z" }),
    orderRow({
      avgFillPrice: "120",
      filledAt: "2026-09-27T02:01:00.000Z",
      filledQuantity: "0.5",
      id: ids[1],
      limitPrice: null,
      quantity: "0.5",
      side: "SELL",
      status: "FILLED",
      type: "MARKET",
      createdAt: "2026-09-27T02:00:00.000Z",
    }),
    orderRow({ id: ids[2], createdAt: "2026-09-27T01:00:00.000Z" }),
  ];
  let query;
  const service = createService({
    async findMany(input) {
      query = input;
      return rows;
    },
  });

  const result = await service.list(userId, { limit: 2 });

  assert.equal(query.take, 3);
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(query.where, { userId });
  assert.deepEqual(result, {
    items: [serializedOrder(rows[0]), serializedOrder(rows[1])],
    nextCursor: ids[1],
  });
});

test("uses an owned cursor as an exclusive created-at and id boundary", async () => {
  const cursor = randomUUID();
  const createdAt = new Date("2026-09-27T02:00:00.000Z");
  let cursorQuery;
  let pageQuery;
  const service = createService({
    async findFirst(input) {
      cursorQuery = input;
      return { createdAt, id: cursor };
    },
    async findMany(input) {
      pageQuery = input;
      return [];
    },
  });

  assert.deepEqual(
    await service.list(userId, {
      cursor,
      limit: 20,
      side: "BUY",
      status: "PENDING",
      symbol: "BTC-USD",
    }),
    { items: [], nextCursor: null },
  );
  assert.deepEqual(cursorQuery, {
    select: { createdAt: true, id: true },
    where: { id: cursor, userId },
  });
  assert.deepEqual(pageQuery.where, {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor } }],
    side: "BUY",
    status: "PENDING",
    symbol: "BTC-USD",
    userId,
  });
});

test("rejects missing or foreign cursors and sanitizes storage failures", async () => {
  const missingCursor = randomUUID();
  const invalid = createService({
    async findFirst() {
      return null;
    },
  });
  await assert.rejects(
    invalid.list(userId, { cursor: missingCursor, limit: 20 }),
    (error) => error instanceof OrdersQueryError && error.code === "INVALID_CURSOR",
  );

  const unavailable = createService({
    async findMany() {
      throw new Error("database credential leaked");
    },
  });
  await assert.rejects(unavailable.list(userId, { limit: 20 }), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.getResponse().error.code, "ORDERS_UNAVAILABLE");
    assert.equal(JSON.stringify(error.getResponse()).includes("credential"), false);
    return true;
  });
});

function createService(order) {
  return new OrdersQueryService({
    client: {
      async $transaction(callback, options) {
        assert.deepEqual(options, { isolationLevel: "RepeatableRead" });
        return callback({ order });
      },
    },
  });
}

function orderRow({
  avgFillPrice = null,
  cancelledAt = null,
  createdAt,
  filledAt = null,
  filledQuantity = "0",
  id,
  limitPrice = "100",
  quantity = "1",
  side = "BUY",
  status = "PENDING",
  symbol = "BTC-USD",
  type = "LIMIT",
}) {
  return {
    avgFillPrice: decimal(avgFillPrice),
    cancelledAt: cancelledAt ? new Date(cancelledAt) : null,
    createdAt: new Date(createdAt),
    filledAt: filledAt ? new Date(filledAt) : null,
    filledQuantity: decimal(filledQuantity),
    id,
    limitPrice: decimal(limitPrice),
    quantity: decimal(quantity),
    side,
    status,
    symbol,
    type,
  };
}

function decimal(value) {
  return value === null ? null : { toString: () => value };
}

function serializedOrder(order) {
  return {
    avgFillPrice: order.avgFillPrice?.toString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    filledAt: order.filledAt?.toISOString() ?? null,
    filledQuantity: order.filledQuantity.toString(),
    id: order.id,
    limitPrice: order.limitPrice?.toString() ?? null,
    quantity: order.quantity.toString(),
    side: order.side,
    status: order.status,
    symbol: order.symbol,
    type: order.type,
  };
}
