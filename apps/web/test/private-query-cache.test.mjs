import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { QueryClient } = require("@tanstack/react-query");
const {
  clearPrivateQueryCache,
  isPrivateQueryKey,
} = require("../.next/realtime-test/features/auth/model/private-query-cache.js");

test("recognizes only the documented private query scopes", () => {
  assert.equal(isPrivateQueryKey(["auth", "me"]), true);
  assert.equal(isPrivateQueryKey(["portfolio", "summary"]), true);
  assert.equal(isPrivateQueryKey(["orders", "list", { status: "PENDING" }]), true);
  assert.equal(isPrivateQueryKey(["watchlist"]), true);
  assert.equal(isPrivateQueryKey(["markets", "BTC-USD", "candles"]), false);
  assert.equal(isPrivateQueryKey(["trading", "BTC-USD"]), false);
});

test("removes private data while retaining public market data", () => {
  const queryClient = new QueryClient();
  const user = { email: "user@example.com" };

  queryClient.setQueryData(["auth", "me"], user);
  queryClient.setQueryData(["portfolio", "summary"], { totalValue: "10000" });
  queryClient.setQueryData(["orders", "list"], [{ id: "order-1" }]);
  queryClient.setQueryData(["watchlist"], ["BTC-USD"]);
  queryClient.setQueryData(["markets", "BTC-USD", "candles"], [{ close: "100" }]);

  clearPrivateQueryCache(queryClient);

  assert.equal(queryClient.getQueryData(["auth", "me"]), undefined);
  assert.equal(queryClient.getQueryData(["portfolio", "summary"]), undefined);
  assert.equal(queryClient.getQueryData(["orders", "list"]), undefined);
  assert.equal(queryClient.getQueryData(["watchlist"]), undefined);
  assert.deepEqual(queryClient.getQueryData(["markets", "BTC-USD", "candles"]), [{ close: "100" }]);
});
