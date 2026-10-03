import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { UnauthorizedException } = require("@nestjs/common");
const {
  watchlistAddRequestSchema,
  watchlistAddResponseSchema,
  watchlistListResponseSchema,
  watchlistRemoveParamsSchema,
} = require("@pulse-trade/contracts");
const { WatchlistController } = require("../dist/watchlist/watchlist.controller.js");
const user = { email: "watchlist@example.com", id: randomUUID() };
const item = { createdAt: "2026-10-03T00:00:00.000Z", id: randomUUID(), symbol: "BTC-USD" };

function createController({ currentUser, watchlist } = {}) {
  return new WatchlistController(
    currentUser ?? {
      async resolve() {
        return user;
      },
    },
    watchlist ?? {
      async list() {
        return [item];
      },
      async add() {
        return item;
      },
      async remove() {},
    },
  );
}

test("watchlist request and response contracts validate strict public shapes", () => {
  assert.deepEqual(watchlistAddRequestSchema.parse({ symbol: "BTC-USD" }), { symbol: "BTC-USD" });
  assert.deepEqual(watchlistRemoveParamsSchema.parse({ symbol: "ETH-USD" }), { symbol: "ETH-USD" });
  assert.deepEqual(watchlistAddResponseSchema.parse({ data: item }), { data: item });
  assert.deepEqual(watchlistListResponseSchema.parse({ data: { items: [item] } }), {
    data: { items: [item] },
  });
  assert.deepEqual(watchlistListResponseSchema.parse({ data: { items: [] } }), {
    data: { items: [] },
  });
  for (const body of [
    null,
    [],
    {},
    { symbol: "" },
    { symbol: "btc-usd" },
    { symbol: " BTC-USD " },
    { symbol: "BTC/USD" },
    { symbol: 12 },
    { symbol: `${"A".repeat(21)}-USD` },
    { symbol: "BTC-USD", userId: user.id },
    { symbol: "BTC-USD", injected: true },
  ]) {
    assert.equal(watchlistAddRequestSchema.safeParse(body).success, false);
    assert.equal(watchlistRemoveParamsSchema.safeParse(body).success, false);
  }
  for (const invalid of [
    { ...item, id: "not-a-uuid" },
    { ...item, createdAt: "not-a-date" },
    { ...item, symbol: "btc-usd" },
    { ...item, userId: user.id },
  ]) {
    assert.equal(watchlistAddResponseSchema.safeParse({ data: invalid }).success, false);
    assert.equal(
      watchlistListResponseSchema.safeParse({ data: { items: [invalid] } }).success,
      false,
    );
  }
  assert.equal(
    watchlistListResponseSchema.safeParse({ data: { items: [], userId: user.id } }).success,
    false,
  );
});

test("all watchlist operations authenticate first and use only the resolved user", async () => {
  const calls = [];
  const controller = createController({
    currentUser: {
      async resolve(authorization) {
        calls.push(["auth", authorization]);
        return user;
      },
    },
    watchlist: {
      async list(userId) {
        calls.push(["list", userId]);
        return [item];
      },
      async add(userId, symbol) {
        calls.push(["add", userId, symbol]);
        return item;
      },
      async remove(userId, symbol) {
        calls.push(["remove", userId, symbol]);
      },
    },
  });
  assert.deepEqual(await controller.list("Bearer access"), { data: { items: [item] } });
  assert.deepEqual(await controller.add({ symbol: "BTC-USD" }, "Bearer access"), { data: item });
  assert.equal(await controller.remove("BTC-USD", "Bearer access"), undefined);
  assert.deepEqual(calls, [
    ["auth", "Bearer access"],
    ["list", user.id],
    ["auth", "Bearer access"],
    ["add", user.id, "BTC-USD"],
    ["auth", "Bearer access"],
    ["remove", user.id, "BTC-USD"],
  ]);
});

test("authentication failure prevents reads and mutations even for invalid inputs", async () => {
  const controller = createController({
    currentUser: {
      async resolve() {
        throw new UnauthorizedException({ error: { code: "UNAUTHENTICATED" } });
      },
    },
    watchlist: {
      list() {
        assert.fail("must not read without auth");
      },
      add() {
        assert.fail("must not add without auth");
      },
      remove() {
        assert.fail("must not remove without auth");
      },
    },
  });
  for (const operation of [
    () => controller.list(undefined),
    () => controller.add({}, undefined),
    () => controller.remove("invalid", undefined),
  ]) {
    await assert.rejects(
      operation,
      (error) => error.getStatus() === 401 && error.getResponse().error.code === "UNAUTHENTICATED",
    );
  }
});

test("invalid watchlist bodies and path symbols never reach storage", async () => {
  const controller = createController({
    watchlist: {
      add() {
        assert.fail("must not add invalid input");
      },
      remove() {
        assert.fail("must not delete invalid input");
      },
    },
  });
  for (const body of [
    null,
    {},
    { symbol: "BTC-USD", userId: randomUUID() },
    { symbol: "btc-usd" },
  ]) {
    await assert.rejects(controller.add(body, "Bearer access"), (error) => {
      assert.equal(error.getStatus(), 400);
      assert.equal(error.getResponse().error.code, "INVALID_WATCHLIST_REQUEST");
      assert.equal(error.getResponse().error.details, null);
      return true;
    });
  }
  await assert.rejects(
    controller.remove("btc-usd", "Bearer access"),
    (error) =>
      error.getStatus() === 400 && error.getResponse().error.code === "INVALID_WATCHLIST_REQUEST",
  );
});
