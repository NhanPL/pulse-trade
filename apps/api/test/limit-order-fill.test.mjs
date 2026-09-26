import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { TradingDomainError } = require("../dist/trading/domain/decimal.js");
const { LimitOrderFillService } = require("../dist/trading/limit-order-fill.service.js");

function decimal(value) {
  return { toString: () => value };
}

function candidate(overrides = {}) {
  return {
    limitPrice: "100",
    marketPrice: "90",
    marketTs: 1_700_000_000_000,
    orderId: "order-1",
    side: "BUY",
    symbol: "BTC-USD",
    ...overrides,
  };
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
    symbol: "BTC-USD",
    type: "LIMIT",
    userId: "user-1",
    ...overrides,
  };
}

function createService({
  claimCount = 1,
  currentOrder = order(),
  currentPosition = null,
  positionUpdateCount = 1,
  reservationUpdateCount = 1,
  transactionFailures = [],
} = {}) {
  const calls = {
    orderClaim: [],
    orderFind: [],
    positionFind: [],
    positionUpdate: [],
    positionUpsert: [],
    tradeCreate: [],
    transactionOptions: [],
    walletUpdate: [],
    walletUpsert: [],
  };
  const transaction = {
    order: {
      async findUnique(args) {
        calls.orderFind.push(args);
        return currentOrder;
      },
      async updateMany(args) {
        calls.orderClaim.push(args);
        return { count: claimCount };
      },
    },
    position: {
      async findUnique(args) {
        calls.positionFind.push(args);
        return currentPosition;
      },
      async updateMany(args) {
        calls.positionUpdate.push(args);
        return { count: positionUpdateCount };
      },
      async upsert(args) {
        calls.positionUpsert.push(args);
        return args;
      },
    },
    trade: {
      async create(args) {
        calls.tradeCreate.push(args);
        return { id: "trade-1" };
      },
    },
    walletBalance: {
      async updateMany(args) {
        calls.walletUpdate.push(args);
        return { count: reservationUpdateCount };
      },
      async upsert(args) {
        calls.walletUpsert.push(args);
        return args;
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
  const evaluator = { onEligibleOrder: () => () => {} };

  return { calls, service: new LimitOrderFillService(prisma, evaluator) };
}

test("registers one evaluator listener and removes it during shutdown", () => {
  let listener;
  let registrations = 0;
  let removals = 0;
  const evaluator = {
    onEligibleOrder(nextListener) {
      listener = nextListener;
      registrations++;
      return () => removals++;
    },
  };
  const service = new LimitOrderFillService({ client: {} }, evaluator);

  service.onModuleInit();
  service.onModuleInit();
  assert.equal(typeof listener, "function");
  assert.equal(registrations, 1);

  service.onModuleDestroy();
  service.onModuleDestroy();
  assert.equal(removals, 1);
});

test("fills a limit BUY atomically and releases price improvement", async () => {
  const { calls, service } = createService();

  const result = await service.fill(candidate());

  assert.equal(result.executionPrice, "90");
  assert.equal(result.quoteAmount, "45");
  assert.equal(result.tradeId, "trade-1");
  assert.ok(result.executedAt instanceof Date);
  assert.deepEqual(calls.transactionOptions, [{ isolationLevel: "Serializable" }]);
  assert.deepEqual(calls.walletUpdate, [
    {
      data: {
        available: { increment: "5" },
        locked: { decrement: "50" },
      },
      where: { asset: "USD", locked: { gte: "50" }, userId: "user-1" },
    },
  ]);
  assert.deepEqual(calls.walletUpsert, [
    {
      create: { asset: "BTC", available: "0.5", locked: "0", userId: "user-1" },
      update: { available: { increment: "0.5" } },
      where: { userId_asset: { asset: "BTC", userId: "user-1" } },
    },
  ]);
  assert.deepEqual(calls.positionUpsert, [
    {
      create: {
        asset: "BTC",
        averageCostUsd: "90",
        quantity: "0.5",
        realizedPnlUsd: "0",
        userId: "user-1",
      },
      update: { averageCostUsd: "90", quantity: "0.5", realizedPnlUsd: "0" },
      where: { userId_asset: { asset: "BTC", userId: "user-1" } },
    },
  ]);
  assert.equal(calls.tradeCreate[0].data.orderId, "order-1");
  assert.equal(calls.tradeCreate[0].data.quoteAmount, "45");
  assert.deepEqual(calls.orderClaim[0], {
    data: {
      avgFillPrice: "90",
      filledAt: result.executedAt,
      filledQuantity: "0.5",
      status: "FILLED",
    },
    where: { id: "order-1", status: "PENDING", type: "LIMIT" },
  });
});

test("fills a limit SELL from locked assets and realizes P&L", async () => {
  const { calls, service } = createService({
    currentOrder: order({
      limitPrice: decimal("100"),
      reservedAmount: decimal("0.5"),
      reservedAsset: "BTC",
      side: "SELL",
    }),
    currentPosition: {
      averageCostUsd: decimal("80"),
      quantity: decimal("2"),
      realizedPnlUsd: decimal("5"),
    },
  });

  const result = await service.fill(candidate({ marketPrice: "110", side: "SELL" }));

  assert.equal(result.quoteAmount, "55");
  assert.deepEqual(calls.walletUpdate, [
    {
      data: { locked: { decrement: "0.5" } },
      where: { asset: "BTC", locked: { gte: "0.5" }, userId: "user-1" },
    },
  ]);
  assert.deepEqual(calls.positionUpdate, [
    {
      data: { averageCostUsd: "80", quantity: "1.5", realizedPnlUsd: "20" },
      where: { asset: "BTC", quantity: { gte: "0.5" }, userId: "user-1" },
    },
  ]);
  assert.deepEqual(calls.walletUpsert, [
    {
      create: { asset: "USD", available: "55", locked: "0", userId: "user-1" },
      update: { available: { increment: "55" } },
      where: { userId_asset: { asset: "USD", userId: "user-1" } },
    },
  ]);
  assert.equal(calls.tradeCreate[0].data.side, "SELL");
  assert.equal(calls.orderClaim[0].data.status, "FILLED");
});

test("ignores a candidate when the order is no longer fillable", async () => {
  const { calls, service } = createService({
    currentOrder: order({ status: "CANCELLED" }),
  });

  assert.equal(await service.fill(candidate()), undefined);
  assert.equal(calls.walletUpdate.length, 0);
  assert.equal(calls.tradeCreate.length, 0);
  assert.equal(calls.orderClaim.length, 0);
});

test("stops before financial mutations when another evaluator already claimed the order", async () => {
  const { calls, service } = createService({ claimCount: 0 });

  assert.equal(await service.fill(candidate()), undefined);
  assert.equal(calls.orderClaim.length, 1);
  assert.equal(calls.walletUpdate.length, 0);
  assert.equal(calls.positionUpsert.length, 0);
  assert.equal(calls.tradeCreate.length, 0);
});

test("fails the transaction when the persisted reservation is inconsistent", async () => {
  const { calls, service } = createService({ reservationUpdateCount: 0 });

  await assert.rejects(
    service.fill(candidate()),
    (error) =>
      error instanceof TradingDomainError &&
      error.message === "Limit order order-1 has an inconsistent reservation.",
  );
  assert.equal(calls.tradeCreate.length, 0);
  assert.equal(calls.orderClaim.length, 1);
});

test("retries serialization conflicts so the loser can observe the committed fill", async () => {
  const retry = createService({ transactionFailures: [{ code: "P2034" }] });
  await retry.service.fill(candidate());
  assert.equal(retry.calls.transactionOptions.length, 2);

  const exhausted = createService({
    transactionFailures: [{ code: "P2034" }, { code: "P2034" }, { code: "P2034" }],
  });
  await assert.rejects(exhausted.service.fill(candidate()), (error) => error.code === "P2034");
  assert.equal(exhausted.calls.transactionOptions.length, 3);
});
