import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { MarketOrderError } = require("../dist/trading/market-order.error.js");
const { MarketSellService } = require("../dist/trading/market-sell.service.js");

function createService({
  executionPrice = "70000",
  position = { averageCostUsd: "55000", quantity: "2", realizedPnlUsd: "20" },
  baseDebitCount = 1,
  executionErrorCode,
  positionUpdateCount = 1,
  transactionFailures = [],
} = {}) {
  const calls = {
    baseWallet: [],
    order: [],
    positionFind: [],
    positionWrite: [],
    quoteWallet: [],
    transactionOptions: [],
    trade: [],
  };
  const transaction = {
    walletBalance: {
      async updateMany(args) {
        calls.baseWallet.push(args);
        return { count: baseDebitCount };
      },
      async upsert(args) {
        calls.quoteWallet.push(args);
        return {};
      },
    },
    position: {
      async findUnique(args) {
        calls.positionFind.push(args);
        return position;
      },
      async updateMany(args) {
        calls.positionWrite.push(args);
        return { count: positionUpdateCount };
      },
    },
    order: {
      async create(args) {
        calls.order.push(args);
        return { id: "order-1" };
      },
    },
    trade: {
      async create(args) {
        calls.trade.push(args);
        return { id: "trade-1" };
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
  const executionPrices = {
    getPrice() {
      if (executionErrorCode) {
        throw new MarketOrderError(executionErrorCode, "Market execution price is unavailable.");
      }
      if (!executionPrice || executionPrice === "not-a-price") {
        throw new MarketOrderError(
          "MARKET_DATA_UNAVAILABLE",
          "Market execution price is unavailable.",
        );
      }
      return executionPrice;
    },
  };

  return { calls, service: new MarketSellService({ client }, executionPrices) };
}

test("fills a market SELL atomically, credits USD, and realizes P&L", async () => {
  const { calls, service } = createService();

  const result = await service.execute({
    quantity: "0.5",
    symbol: "BTC-USD",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    executionPrice: "70000",
    executedAt: result.executedAt,
    orderId: "order-1",
    quantity: "0.5",
    quoteAmount: "35000",
    symbol: "BTC-USD",
    tradeId: "trade-1",
  });
  assert.equal(result.executedAt instanceof Date, true);
  assert.deepEqual(calls.transactionOptions, [{ isolationLevel: "Serializable" }]);
  assert.deepEqual(calls.baseWallet, [
    {
      data: { available: { decrement: "0.5" } },
      where: {
        asset: "BTC",
        available: { gte: "0.5" },
        userId: "user-1",
      },
    },
  ]);
  assert.deepEqual(calls.positionWrite, [
    {
      data: { averageCostUsd: "55000", quantity: "1.5", realizedPnlUsd: "7520" },
      where: {
        asset: "BTC",
        quantity: { gte: "0.5" },
        userId: "user-1",
      },
    },
  ]);
  assert.deepEqual(calls.quoteWallet[0], {
    create: { asset: "USD", available: "35000", locked: "0", userId: "user-1" },
    update: { available: { increment: "35000" } },
    where: { userId_asset: { asset: "USD", userId: "user-1" } },
  });
  assert.deepEqual(calls.order[0].data, {
    avgFillPrice: "70000",
    baseAsset: "BTC",
    filledAt: result.executedAt,
    filledQuantity: "0.5",
    quantity: "0.5",
    quoteAsset: "USD",
    side: "SELL",
    status: "FILLED",
    symbol: "BTC-USD",
    type: "MARKET",
    userId: "user-1",
  });
  assert.deepEqual(calls.trade[0].data, {
    executedAt: result.executedAt,
    orderId: "order-1",
    price: "70000",
    quantity: "0.5",
    quoteAmount: "35000",
    side: "SELL",
    symbol: "BTC-USD",
    userId: "user-1",
  });
});

test("resets the cost basis when a sell closes the position", async () => {
  const { calls, service } = createService({ executionPrice: "50000" });

  await service.execute({ quantity: "2", symbol: "BTC-USD", userId: "user-1" });

  assert.deepEqual(calls.positionWrite[0].data, {
    averageCostUsd: "0",
    quantity: "0",
    realizedPnlUsd: "-9980",
  });
});

test("rejects insufficient base balance without crediting USD or creating a fill", async () => {
  const { calls, service } = createService({ baseDebitCount: 0 });

  await assert.rejects(
    service.execute({ quantity: "0.5", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "INSUFFICIENT_BALANCE",
  );
  assert.equal(calls.positionWrite.length, 0);
  assert.equal(calls.quoteWallet.length, 0);
  assert.equal(calls.order.length, 0);
  assert.equal(calls.trade.length, 0);
});

test("rejects a missing or insufficient position before debiting a base wallet", async () => {
  const missing = createService({ position: null });
  await assert.rejects(
    missing.service.execute({ quantity: "0.5", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "INSUFFICIENT_BALANCE",
  );
  assert.equal(missing.calls.baseWallet.length, 0);

  const insufficient = createService({
    position: { averageCostUsd: "55000", quantity: "0.25", realizedPnlUsd: "20" },
  });
  await assert.rejects(
    insufficient.service.execute({ quantity: "0.5", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "INSUFFICIENT_BALANCE",
  );
  assert.equal(insufficient.calls.baseWallet.length, 0);
});

test("rejects invalid inputs and unavailable market prices before a transaction", async () => {
  const invalidQuantity = createService();
  await assert.rejects(
    invalidQuantity.service.execute({ quantity: "0", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "INVALID_QUANTITY",
  );

  const unsupportedSymbol = createService();
  await assert.rejects(
    unsupportedSymbol.service.execute({ quantity: "0.5", symbol: "BTC_USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "UNSUPPORTED_SYMBOL",
  );

  const unavailableMarket = createService({ executionPrice: null });
  await assert.rejects(
    unavailableMarket.service.execute({ quantity: "0.5", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "MARKET_DATA_UNAVAILABLE",
  );

  const staleMarket = createService({ executionErrorCode: "MARKET_DATA_STALE" });
  await assert.rejects(
    staleMarket.service.execute({ quantity: "0.5", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "MARKET_DATA_STALE",
  );

  for (const calls of [
    invalidQuantity.calls,
    unsupportedSymbol.calls,
    unavailableMarket.calls,
    staleMarket.calls,
  ]) {
    assert.equal(calls.transactionOptions.length, 0);
  }
});

test("retries serializable transaction conflicts and exposes exhaustion as an order conflict", async () => {
  const retry = createService({ transactionFailures: [{ code: "P2034" }] });
  await retry.service.execute({ quantity: "0.5", symbol: "BTC-USD", userId: "user-1" });
  assert.equal(retry.calls.transactionOptions.length, 2);

  const exhausted = createService({
    transactionFailures: [{ code: "P2034" }, { code: "P2034" }, { code: "P2034" }],
  });
  await assert.rejects(
    exhausted.service.execute({ quantity: "0.5", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "ORDER_CONFLICT",
  );
  assert.equal(exhausted.calls.transactionOptions.length, 3);
});
