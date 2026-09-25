import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { setImmediate as waitForImmediate } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { SUPPORTED_MARKET_SYMBOLS } = require("../dist/markets/supported-markets.js");
const {
  PENDING_ORDER_EVALUATION_BATCH_SIZE,
  PendingOrderEvaluator,
  isLimitOrderEligible,
} = require("../dist/trading/pending-order-evaluator.service.js");
const { SubscriptionRegistry } = require("../dist/realtime/subscription-registry.service.js");

class FakeProvider {
  listeners = new Set();
  subscriptions = [];
  unsubscriptions = [];

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribe(subscription) {
    this.subscriptions.push(subscription);
  }

  unsubscribe(subscription) {
    this.unsubscriptions.push(subscription);
  }
}

function ticker(overrides = {}) {
  return {
    change24hPercent: "1",
    high24h: "110",
    low24h: "90",
    marketTs: 1_700_000_000_000,
    price: "100",
    providerSequence: 1,
    symbol: "BTC-USD",
    type: "ticker",
    volume24h: "10",
    ...overrides,
  };
}

function decimal(value) {
  return { toString: () => value };
}

function createEvaluator({ findMany } = {}) {
  const calls = [];
  const provider = new FakeProvider();
  const prisma = {
    client: {
      order: {
        async findMany(args) {
          calls.push(args);
          return findMany ? findMany(args, calls.length) : [];
        },
      },
    },
  };
  const registry = new SubscriptionRegistry(provider);
  const evaluator = new PendingOrderEvaluator(provider, prisma, registry, {
    evaluationIntervalMs: 0,
  });
  return { calls, evaluator, provider };
}

test("applies the documented BUY and SELL trigger boundaries with fixed-point decimals", () => {
  assert.equal(isLimitOrderEligible("BUY", "100", "100"), true);
  assert.equal(isLimitOrderEligible("BUY", "99.999", "100"), true);
  assert.equal(isLimitOrderEligible("BUY", "100.001", "100"), false);
  assert.equal(isLimitOrderEligible("SELL", "100", "100.000"), true);
  assert.equal(isLimitOrderEligible("SELL", "100.001", "100"), true);
  assert.equal(isLimitOrderEligible("SELL", "99.999", "100"), false);
  assert.equal(isLimitOrderEligible("BUY", "0", "100"), false);
  assert.equal(isLimitOrderEligible("SELL", "not-a-price", "100"), false);
});

test("queries a bounded eligible batch and emits only defensively verified pending orders", async () => {
  const rows = [
    { id: "buy-1", limitPrice: decimal("110"), side: "BUY", symbol: "BTC-USD" },
    { id: "sell-1", limitPrice: decimal("90"), side: "SELL", symbol: "BTC-USD" },
    { id: "buy-ineligible", limitPrice: decimal("90"), side: "BUY", symbol: "BTC-USD" },
    { id: "invalid-limit", limitPrice: null, side: "SELL", symbol: "BTC-USD" },
  ];
  const { calls, evaluator } = createEvaluator({ findMany: async () => rows });
  const eligible = [];
  evaluator.onEligibleOrder((order) => eligible.push(order));

  const result = await evaluator.evaluateTicker(ticker());

  assert.deepEqual(calls, [
    {
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, limitPrice: true, side: true, symbol: true },
      take: PENDING_ORDER_EVALUATION_BATCH_SIZE,
      where: {
        OR: [
          { limitPrice: { gte: "100" }, side: "BUY" },
          { limitPrice: { lte: "100" }, side: "SELL" },
        ],
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
      },
    },
  ]);
  assert.deepEqual(result, [
    {
      limitPrice: "110",
      marketPrice: "100",
      marketTs: 1_700_000_000_000,
      orderId: "buy-1",
      side: "BUY",
      symbol: "BTC-USD",
    },
    {
      limitPrice: "90",
      marketPrice: "100",
      marketTs: 1_700_000_000_000,
      orderId: "sell-1",
      side: "SELL",
      symbol: "BTC-USD",
    },
  ]);
  assert.deepEqual(eligible, result);
});

test("keeps the engine ticker feed alive without browser subscriptions and releases it on shutdown", () => {
  const { evaluator, provider } = createEvaluator();

  evaluator.onModuleInit();

  assert.deepEqual(provider.subscriptions, [
    { channels: ["ticker"], symbols: [...SUPPORTED_MARKET_SYMBOLS] },
  ]);
  assert.equal(provider.listeners.size, 1);

  evaluator.onModuleDestroy();
  evaluator.onModuleDestroy();
  assert.deepEqual(provider.unsubscriptions, [
    { channels: ["ticker"], symbols: [...SUPPORTED_MARKET_SYMBOLS] },
  ]);
  assert.equal(provider.listeners.size, 0);
});

test("ignores non-tickers and stale versions while coalescing the newest ticker per symbol", async () => {
  let resolveFirst;
  const firstQuery = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const prices = [];
  const { calls, evaluator, provider } = createEvaluator({
    findMany: async (args, callNumber) => {
      prices.push(args.where.OR[0].limitPrice.gte);
      if (callNumber === 1) return firstQuery;
      return [];
    },
  });
  evaluator.onModuleInit();

  provider.emit({ ...ticker(), candle: {}, type: "candle.update" });
  provider.emit(ticker({ price: "100", providerSequence: 2 }));
  provider.emit(ticker({ price: "80", providerSequence: 1 }));
  provider.emit(ticker({ price: "99", providerSequence: 3 }));
  provider.emit(ticker({ price: "98", providerSequence: 4 }));
  assert.equal(calls.length, 1);

  resolveFirst([]);
  await waitForImmediate();
  await waitForImmediate();

  assert.equal(calls.length, 2);
  assert.deepEqual(prices, ["100", "98"]);
  evaluator.onModuleDestroy();
});

test("isolates failing eligible-order listeners and rejects non-positive ticker prices", async () => {
  const { calls, evaluator } = createEvaluator({
    findMany: async () => [
      { id: "sell-1", limitPrice: decimal("90"), side: "SELL", symbol: "BTC-USD" },
    ],
  });
  const observed = [];
  evaluator.onEligibleOrder(() => {
    throw new Error("filler unavailable");
  });
  evaluator.onEligibleOrder((order) => observed.push(order.orderId));

  await evaluator.evaluateTicker(ticker());
  assert.deepEqual(observed, ["sell-1"]);

  assert.deepEqual(await evaluator.evaluateTicker(ticker({ price: "0" })), []);
  assert.equal(calls.length, 1);
});
