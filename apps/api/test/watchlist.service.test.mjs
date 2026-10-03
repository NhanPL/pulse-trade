import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { WatchlistService } = require("../dist/watchlist/watchlist.service.js");
const item = {
  createdAt: new Date("2026-10-03T00:00:00.000Z"),
  id: randomUUID(),
  symbol: "BTC-USD",
};
const select = { createdAt: true, id: true, symbol: true };

function createService({ items = [item], failure } = {}) {
  const calls = [];
  const client = {
    watchlistItem: {
      async findMany(args) {
        calls.push(["list", args]);
        if (failure) throw failure;
        return items;
      },
      async upsert(args) {
        calls.push(["add", args]);
        if (failure) throw failure;
        return item;
      },
      async deleteMany(args) {
        calls.push(["remove", args]);
        if (failure) throw failure;
        return { count: 0 };
      },
    },
  };
  return { calls, service: new WatchlistService({ client }) };
}

test("lists only the owner's saved markets with deterministic ordering and public fields", async () => {
  const { calls, service } = createService();
  assert.deepEqual(await service.list("owner"), [
    { ...item, createdAt: item.createdAt.toISOString() },
  ]);
  assert.deepEqual(calls, [
    [
      "list",
      { where: { userId: "owner" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select },
    ],
  ]);
  assert.deepEqual(await createService({ items: [] }).service.list("empty-owner"), []);
});

test("uses the user/symbol unique key for an atomic idempotent add preserving id and createdAt", async () => {
  const { calls, service } = createService();
  const first = await service.add("owner", "BTC-USD");
  assert.deepEqual(await service.add("owner", "BTC-USD"), first);
  const args = {
    where: { userId_symbol: { userId: "owner", symbol: "BTC-USD" } },
    create: { userId: "owner", symbol: "BTC-USD" },
    update: { symbol: "BTC-USD" },
    select,
  };
  assert.deepEqual(calls, [
    ["add", args],
    ["add", args],
  ]);
  assert.equal(Object.hasOwn(first, "userId"), false);
});

test("removal is owner-scoped and succeeds for an already missing symbol", async () => {
  const { calls, service } = createService();
  assert.equal(await service.remove("owner", "BTC-USD"), undefined);
  assert.equal(await service.remove("owner", "BTC-USD"), undefined);
  assert.deepEqual(calls, [
    ["remove", { where: { userId: "owner", symbol: "BTC-USD" } }],
    ["remove", { where: { userId: "owner", symbol: "BTC-USD" } }],
  ]);
});

test("unsupported symbols fail before any mutation", async () => {
  const { calls, service } = createService();
  for (const symbol of ["DOGE-USD", "btc-usd", "BTC-EUR", ""]) {
    for (const operation of [
      () => service.add("owner", symbol),
      () => service.remove("owner", symbol),
    ]) {
      await assert.rejects(
        operation,
        (error) =>
          error.getStatus() === 400 && error.getResponse().error.code === "UNSUPPORTED_SYMBOL",
      );
    }
  }
  assert.deepEqual(calls, []);
});

test("all storage failures use a sanitized watchlist error", async () => {
  const { service } = createService({ failure: new Error("database connection secret") });
  for (const operation of [
    () => service.list("owner"),
    () => service.add("owner", "BTC-USD"),
    () => service.remove("owner", "BTC-USD"),
  ]) {
    await assert.rejects(operation, (error) => {
      assert.equal(error.getStatus(), 503);
      assert.deepEqual(error.getResponse(), {
        error: {
          code: "WATCHLIST_UNAVAILABLE",
          details: null,
          message: "Watchlist is temporarily unavailable. Please try again later.",
        },
      });
      assert.equal(JSON.stringify(error.getResponse()).includes("secret"), false);
      return true;
    });
  }
  const unavailable = new WatchlistService({
    get client() {
      throw new Error("missing database secret");
    },
  });
  await assert.rejects(
    unavailable.list("owner"),
    (error) => error.getResponse().error.code === "WATCHLIST_UNAVAILABLE",
  );
});
