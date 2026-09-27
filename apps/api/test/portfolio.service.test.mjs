import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { PortfolioService } = require("../dist/portfolio/portfolio.service.js");

function decimal(value) {
  return { toString: () => value };
}

function createService({ balances = [], failure, positions = [] } = {}) {
  const calls = { balances: [], positions: [], transactions: [] };
  const transaction = {
    walletBalance: {
      async findMany(args) {
        calls.balances.push(args);
        return balances;
      },
    },
    position: {
      async findMany(args) {
        calls.positions.push(args);
        return positions;
      },
    },
  };
  const client = {
    async $transaction(callback, options) {
      calls.transactions.push(options);
      if (failure) throw failure;
      return callback(transaction);
    },
  };

  return { calls, service: new PortfolioService({ client }) };
}

test("returns a repeatable persisted portfolio snapshot scoped to one user", async () => {
  const { calls, service } = createService({
    balances: [
      { asset: "BTC", available: decimal("0.04"), locked: decimal("0.01") },
      { asset: "USD", available: decimal("4500"), locked: decimal("1000") },
    ],
    positions: [
      {
        asset: "BTC",
        averageCostUsd: decimal("60000"),
        quantity: decimal("0.05"),
        realizedPnlUsd: decimal("100"),
      },
      {
        asset: "ETH",
        averageCostUsd: decimal("0"),
        quantity: decimal("0"),
        realizedPnlUsd: decimal("-25"),
      },
    ],
  });

  assert.deepEqual(await service.getSnapshot("user-1"), {
    balances: [
      { asset: "BTC", available: "0.04", locked: "0.01" },
      { asset: "USD", available: "4500", locked: "1000" },
    ],
    quoteCurrency: "USD",
    cash: { available: "4500", locked: "1000" },
    positions: [
      { asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "100" },
      { asset: "ETH", averageCost: "0", quantity: "0", realizedPnl: "-25" },
    ],
  });
  assert.deepEqual(calls.transactions, [{ isolationLevel: "RepeatableRead" }]);
  assert.deepEqual(calls.balances, [
    {
      where: { userId: "user-1" },
      orderBy: { asset: "asc" },
      select: { asset: true, available: true, locked: true },
    },
  ]);
  assert.deepEqual(calls.positions, [
    {
      where: { userId: "user-1" },
      orderBy: { asset: "asc" },
      select: { asset: true, averageCostUsd: true, quantity: true, realizedPnlUsd: true },
    },
  ]);
});

test("returns an empty zero-cash snapshot when no persisted portfolio rows exist", async () => {
  const { service } = createService();

  assert.deepEqual(await service.getSnapshot("user-without-wallet"), {
    balances: [],
    quoteCurrency: "USD",
    cash: { available: "0", locked: "0" },
    positions: [],
  });
});

test("sanitizes portfolio storage failures", async () => {
  const { service } = createService({ failure: new Error("database connection secret") });

  await assert.rejects(service.getSnapshot("user-1"), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.deepEqual(error.getResponse(), {
      error: {
        code: "PORTFOLIO_UNAVAILABLE",
        details: null,
        message: "Portfolio is temporarily unavailable. Please try again later.",
      },
    });
    assert.equal(JSON.stringify(error.getResponse()).includes("secret"), false);
    return true;
  });
});
