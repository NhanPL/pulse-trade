import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { MarketBuyService } = require("../dist/trading/market-buy.service.js");
const { MarketOrderError } = require("../dist/trading/market-order.error.js");

function createService({
  executionPrice = "67542.31",
  position = null,
  quoteDebitCount = 1,
  executionErrorCode,
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
        calls.quoteWallet.push(args);
        return { count: quoteDebitCount };
      },
      async upsert(args) {
        calls.baseWallet.push(args);
        return {};
      },
    },
    position: {
      async findUnique(args) {
        calls.positionFind.push(args);
        return position;
      },
      async upsert(args) {
        calls.positionWrite.push(args);
        return {};
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

  return { calls, service: new MarketBuyService({ client }, executionPrices) };
}

test("fills a market BUY atomically with the backend ticker price", async () => {
  const { calls, service } = createService();

  const result = await service.execute({
    quantity: "0.01",
    symbol: "BTC-USD",
    userId: "user-1",
  });

  assert.deepEqual(result, {
    executionPrice: "67542.31",
    executedAt: result.executedAt,
    orderId: "order-1",
    quantity: "0.01",
    quoteAmount: "675.4231",
    symbol: "BTC-USD",
    tradeId: "trade-1",
  });
  assert.equal(result.executedAt instanceof Date, true);
  assert.deepEqual(calls.transactionOptions, [{ isolationLevel: "Serializable" }]);
  assert.deepEqual(calls.quoteWallet, [
    {
      data: { available: { decrement: "675.4231" } },
      where: {
        asset: "USD",
        available: { gte: "675.4231" },
        userId: "user-1",
      },
    },
  ]);
  assert.deepEqual(calls.baseWallet[0], {
    create: { asset: "BTC", available: "0.01", locked: "0", userId: "user-1" },
    update: { available: { increment: "0.01" } },
    where: { userId_asset: { asset: "BTC", userId: "user-1" } },
  });
  assert.deepEqual(calls.positionWrite[0].create, {
    asset: "BTC",
    averageCostUsd: "67542.31",
    quantity: "0.01",
    realizedPnlUsd: "0",
    userId: "user-1",
  });
  assert.deepEqual(calls.order[0].data, {
    avgFillPrice: "67542.31",
    baseAsset: "BTC",
    filledAt: result.executedAt,
    filledQuantity: "0.01",
    quantity: "0.01",
    quoteAsset: "USD",
    side: "BUY",
    status: "FILLED",
    symbol: "BTC-USD",
    type: "MARKET",
    userId: "user-1",
  });
  assert.deepEqual(calls.trade[0].data, {
    executedAt: result.executedAt,
    orderId: "order-1",
    price: "67542.31",
    quantity: "0.01",
    quoteAmount: "675.4231",
    side: "BUY",
    symbol: "BTC-USD",
    userId: "user-1",
  });
});

test("uses weighted average cost when the base position already exists", async () => {
  const { calls, service } = createService({
    executionPrice: "60000",
    position: { averageCostUsd: "50000", quantity: "1", realizedPnlUsd: "12.5" },
  });

  await service.execute({ quantity: "1", symbol: "BTC-USD", userId: "user-1" });

  assert.deepEqual(calls.positionWrite[0].update, {
    averageCostUsd: "55000",
    quantity: "2",
    realizedPnlUsd: "12.5",
  });
});

test("rejects insufficient funds before creating an order, position, or trade", async () => {
  const { calls, service } = createService({ quoteDebitCount: 0 });

  await assert.rejects(
    service.execute({ quantity: "0.01", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "INSUFFICIENT_BALANCE",
  );
  assert.equal(calls.baseWallet.length, 0);
  assert.equal(calls.positionWrite.length, 0);
  assert.equal(calls.order.length, 0);
  assert.equal(calls.trade.length, 0);
});

test("rejects invalid inputs and unavailable market prices before a transaction", async () => {
  const invalidQuantity = createService();
  await assert.rejects(
    invalidQuantity.service.execute({ quantity: "0", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "INVALID_QUANTITY",
  );

  const unsupportedSymbol = createService();
  await assert.rejects(
    unsupportedSymbol.service.execute({ quantity: "0.01", symbol: "BTC_USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "UNSUPPORTED_SYMBOL",
  );

  const unavailableMarket = createService({ executionPrice: null });
  await assert.rejects(
    unavailableMarket.service.execute({ quantity: "0.01", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "MARKET_DATA_UNAVAILABLE",
  );

  const invalidMarketPrice = createService({ executionPrice: "not-a-price" });
  await assert.rejects(
    invalidMarketPrice.service.execute({ quantity: "0.01", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "MARKET_DATA_UNAVAILABLE",
  );

  const staleMarket = createService({ executionErrorCode: "MARKET_DATA_STALE" });
  await assert.rejects(
    staleMarket.service.execute({ quantity: "0.01", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "MARKET_DATA_STALE",
  );

  for (const calls of [
    invalidQuantity.calls,
    unsupportedSymbol.calls,
    unavailableMarket.calls,
    invalidMarketPrice.calls,
    staleMarket.calls,
  ]) {
    assert.equal(calls.transactionOptions.length, 0);
  }
});

test("retries serializable transaction conflicts and exposes exhaustion as an order conflict", async () => {
  const retry = createService({ transactionFailures: [{ code: "P2034" }] });
  await retry.service.execute({ quantity: "0.01", symbol: "BTC-USD", userId: "user-1" });
  assert.equal(retry.calls.transactionOptions.length, 2);

  const exhausted = createService({
    transactionFailures: [{ code: "P2034" }, { code: "P2034" }, { code: "P2034" }],
  });
  await assert.rejects(
    exhausted.service.execute({ quantity: "0.01", symbol: "BTC-USD", userId: "user-1" }),
    (error) => error instanceof MarketOrderError && error.code === "ORDER_CONFLICT",
  );
  assert.equal(exhausted.calls.transactionOptions.length, 3);
});
