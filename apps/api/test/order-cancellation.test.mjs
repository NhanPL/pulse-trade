import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { OrderCancellationError } = require("../dist/trading/order-cancellation.error.js");
const { OrderCancellationService } = require("../dist/trading/order-cancellation.service.js");

function decimal(value) {
  return { toString: () => value };
}

function order(overrides = {}) {
  return {
    baseAsset: "BTC",
    id: "order-1",
    limitPrice: decimal("100"),
    quantity: decimal("0.5"),
    quoteAsset: "USD",
    reservedAmount: decimal("50"),
    reservedAsset: "USD",
    side: "BUY",
    status: "PENDING",
    type: "LIMIT",
    ...overrides,
  };
}

function createService({
  currentOrder = order(),
  releaseCount = 1,
  transactionFailures = [],
} = {}) {
  const calls = { find: [], orderUpdate: [], transactionOptions: [], walletUpdate: [] };
  const transaction = {
    order: {
      async findUnique(args) {
        calls.find.push(args);
        return currentOrder;
      },
      async update(args) {
        calls.orderUpdate.push(args);
        return currentOrder;
      },
    },
    walletBalance: {
      async updateMany(args) {
        calls.walletUpdate.push(args);
        return { count: releaseCount };
      },
    },
  };
  const prisma = {
    client: {
      async $transaction(callback, options) {
        calls.transactionOptions.push(options);
        const failure = transactionFailures.shift();
        if (failure) throw failure;
        return callback(transaction);
      },
    },
  };
  return { calls, service: new OrderCancellationService(prisma) };
}

test("cancels a pending BUY and releases its quote reservation atomically", async () => {
  const { calls, service } = createService();

  const cancellation = await service.cancel("order-1", "user-1");

  assert.equal(cancellation.orderId, "order-1");
  assert.equal(cancellation.releasedAsset, "USD");
  assert.equal(cancellation.releasedAmount, "50");
  assert.ok(cancellation.cancelledAt instanceof Date);
  assert.deepEqual(calls.transactionOptions, [{ isolationLevel: "Serializable" }]);
  assert.deepEqual(calls.find[0].where, {
    id_userId: { id: "order-1", userId: "user-1" },
  });
  assert.deepEqual(calls.walletUpdate, [
    {
      data: {
        available: { increment: "50" },
        locked: { decrement: "50" },
      },
      where: { asset: "USD", locked: { gte: "50" }, userId: "user-1" },
    },
  ]);
  assert.deepEqual(calls.orderUpdate, [
    {
      data: { cancelledAt: cancellation.cancelledAt, status: "CANCELLED" },
      where: { id: "order-1" },
    },
  ]);
});

test("cancels a pending SELL and releases its base reservation", async () => {
  const { calls, service } = createService({
    currentOrder: order({
      reservedAmount: decimal("0.5"),
      reservedAsset: "BTC",
      side: "SELL",
    }),
  });

  const cancellation = await service.cancel("order-1", "user-1");

  assert.equal(cancellation.releasedAsset, "BTC");
  assert.equal(cancellation.releasedAmount, "0.5");
  assert.equal(calls.walletUpdate[0].where.asset, "BTC");
  assert.deepEqual(calls.walletUpdate[0].data, {
    available: { increment: "0.5" },
    locked: { decrement: "0.5" },
  });
});

test("does not reveal another user's order and rejects non-pending orders", async () => {
  const missing = createService({ currentOrder: null });
  await assert.rejects(
    missing.service.cancel("order-1", "other-user"),
    (error) => error instanceof OrderCancellationError && error.code === "ORDER_NOT_FOUND",
  );
  assert.equal(missing.calls.walletUpdate.length, 0);

  const filled = createService({ currentOrder: order({ status: "FILLED" }) });
  await assert.rejects(
    filled.service.cancel("order-1", "user-1"),
    (error) => error instanceof OrderCancellationError && error.code === "ORDER_NOT_CANCELLABLE",
  );
  assert.equal(filled.calls.walletUpdate.length, 0);
});

test("rejects inconsistent or unavailable reservations before changing the order", async () => {
  const inconsistent = createService({
    currentOrder: order({ reservedAmount: decimal("49") }),
  });
  await assert.rejects(
    inconsistent.service.cancel("order-1", "user-1"),
    (error) => error instanceof OrderCancellationError && error.code === "ORDER_NOT_CANCELLABLE",
  );
  assert.equal(inconsistent.calls.walletUpdate.length, 0);
  assert.equal(inconsistent.calls.orderUpdate.length, 0);

  const unavailable = createService({ releaseCount: 0 });
  await assert.rejects(
    unavailable.service.cancel("order-1", "user-1"),
    (error) => error instanceof OrderCancellationError && error.code === "ORDER_NOT_CANCELLABLE",
  );
  assert.equal(unavailable.calls.orderUpdate.length, 0);
});

test("retries serialization conflicts and maps exhausted races to not cancellable", async () => {
  const retry = createService({ transactionFailures: [{ code: "P2034" }] });
  await retry.service.cancel("order-1", "user-1");
  assert.equal(retry.calls.transactionOptions.length, 2);

  const exhausted = createService({
    transactionFailures: [{ code: "P2034" }, { code: "P2034" }, { code: "P2034" }],
  });
  await assert.rejects(
    exhausted.service.cancel("order-1", "user-1"),
    (error) => error instanceof OrderCancellationError && error.code === "ORDER_NOT_CANCELLABLE",
  );
  assert.equal(exhausted.calls.transactionOptions.length, 3);
});
