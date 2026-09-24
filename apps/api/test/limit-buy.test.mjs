import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { LimitBuyService } = require("../dist/trading/limit-buy.service.js");
const { MarketOrderError } = require("../dist/trading/market-order.error.js");

function createService({ reservationCount = 1, transactionFailures = [] } = {}) {
  const calls = {
    order: [],
    transactionOptions: [],
    wallet: [],
  };
  const transaction = {
    walletBalance: {
      async updateMany(args) {
        calls.wallet.push(args);
        return { count: reservationCount };
      },
    },
    order: {
      async create(args) {
        calls.order.push(args);
        return { id: "order-1" };
      },
    },
  };
  const client = {
    async $transaction(callback, options) {
      calls.transactionOptions.push(options);
      const failure = transactionFailures.shift();
      if (failure) throw failure;
      return callback(transaction);
    },
  };

  return { calls, service: new LimitBuyService({ client }) };
}

test("reserves quote funds and creates one pending limit BUY atomically", async () => {
  const { calls, service } = createService();

  const result = await service.reserve({
    limitPrice: "65000.00",
    quantity: "0.01000000",
    symbol: "BTC-USD",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    limitPrice: "65000",
    orderId: "order-1",
    quantity: "0.01",
    reservedAmount: "650",
    reservedAsset: "USD",
    symbol: "BTC-USD",
  });
  assert.deepEqual(calls.transactionOptions, [{ isolationLevel: "Serializable" }]);
  assert.deepEqual(calls.wallet, [
    {
      data: {
        available: { decrement: "650" },
        locked: { increment: "650" },
      },
      where: {
        asset: "USD",
        available: { gte: "650" },
        userId: "user-1",
      },
    },
  ]);
  assert.deepEqual(calls.order, [
    {
      data: {
        baseAsset: "BTC",
        limitPrice: "65000",
        quantity: "0.01",
        quoteAsset: "USD",
        reservedAmount: "650",
        reservedAsset: "USD",
        side: "BUY",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
        userId: "user-1",
      },
      select: { id: true },
    },
  ]);
});

test("calculates reservation amounts with fixed-point decimal arithmetic", async () => {
  const { calls, service } = createService();

  const result = await service.reserve({
    limitPrice: "0.2",
    quantity: "0.3",
    symbol: "BTC-USD",
    userId: "user-1",
  });

  assert.equal(result.reservedAmount, "0.06");
  assert.equal(calls.wallet[0].data.available.decrement, "0.06");
});

test("rejects insufficient quote funds without creating an order", async () => {
  const { calls, service } = createService({ reservationCount: 0 });

  await assert.rejects(
    service.reserve({ limitPrice: "65000", quantity: "1", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "INSUFFICIENT_BALANCE",
  );
  assert.equal(calls.order.length, 0);
});

test("rejects invalid input before starting a transaction", async () => {
  const cases = [
    [{ limitPrice: "0", quantity: "1", symbol: "BTC-USD" }, "INVALID_LIMIT_PRICE"],
    [{ limitPrice: "not-a-price", quantity: "1", symbol: "BTC-USD" }, "INVALID_LIMIT_PRICE"],
    [{ limitPrice: "1", quantity: "0", symbol: "BTC-USD" }, "INVALID_QUANTITY"],
    [{ limitPrice: "1", quantity: "1", symbol: "BTC_USD" }, "UNSUPPORTED_SYMBOL"],
  ];

  for (const [input, code] of cases) {
    const { calls, service } = createService();
    await assert.rejects(
      service.reserve({ ...input, userId: "user-1" }),
      (error) => error instanceof MarketOrderError && error.code === code,
    );
    assert.equal(calls.transactionOptions.length, 0);
  }
});

test("retries serializable conflicts and exposes exhausted retries as an order conflict", async () => {
  const retry = createService({ transactionFailures: [{ code: "P2034" }] });
  await retry.service.reserve({
    limitPrice: "65000",
    quantity: "0.01",
    symbol: "BTC-USD",
    userId: "user-1",
  });
  assert.equal(retry.calls.transactionOptions.length, 2);

  const exhausted = createService({
    transactionFailures: [{ code: "P2034" }, { code: "P2034" }, { code: "P2034" }],
  });
  await assert.rejects(
    exhausted.service.reserve({
      limitPrice: "65000",
      quantity: "0.01",
      symbol: "BTC-USD",
      userId: "user-1",
    }),
    (error) => error instanceof MarketOrderError && error.code === "ORDER_CONFLICT",
  );
  assert.equal(exhausted.calls.transactionOptions.length, 3);
});
