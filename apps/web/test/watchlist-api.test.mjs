import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { QueryClient } = require("@tanstack/react-query");
const {
  fetchWatchlist,
  addWatchlistItem,
  removeWatchlistItem,
  WatchlistRequestError,
} = require("../.next/realtime-test/features/watchlist/api/watchlist.js");
const {
  watchlistQueryKeys,
} = require("../.next/realtime-test/features/watchlist/model/query-keys.js");
const {
  clearPrivateQueryCache,
} = require("../.next/realtime-test/features/auth/model/private-query-cache.js");
const item = {
  id: "123e4567-e89b-42d3-a456-426614174010",
  symbol: "BTC-USD",
  createdAt: "2026-10-04T00:00:00.000Z",
};

function mockFetch(context, implementation) {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = implementation;
}

test("watchlist cache keys isolate owners and are cleared by existing logout cleanup", () => {
  const client = new QueryClient();
  client.setQueryData(watchlistQueryKeys.list("first"), { items: [item] });
  client.setQueryData(watchlistQueryKeys.list("second"), { items: [] });
  assert.deepEqual(client.getQueryData(watchlistQueryKeys.list("second")), { items: [] });
  assert.notDeepEqual(
    watchlistQueryKeys.toggle("first", "BTC-USD"),
    watchlistQueryKeys.toggle("second", "BTC-USD"),
  );
  clearPrivateQueryCache(client);
  assert.equal(client.getQueryData(watchlistQueryKeys.list("first")), undefined);
  assert.equal(client.getQueryData(watchlistQueryKeys.list("second")), undefined);
});

test("GET validates saved items and uses the private authenticated no-store request", async (context) => {
  let request;
  mockFetch(context, async (url, init) => {
    request = { url, init };
    return Response.json({ data: { items: [item] } });
  });
  assert.deepEqual(await fetchWatchlist("synthetic-token"), { items: [item] });
  assert.equal(new URL(request.url).pathname, "/api/v1/watchlist");
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.headers.Authorization, "Bearer synthetic-token");
  assert.equal(request.init.credentials, "include");
  assert.equal(request.init.cache, "no-store");
  assert.ok(request.init.signal instanceof AbortSignal);
});

test("POST sends only the canonical symbol and accepts the confirmed item", async (context) => {
  let request;
  mockFetch(context, async (url, init) => {
    request = { url, init };
    return Response.json({ data: item });
  });
  assert.deepEqual(await addWatchlistItem("synthetic-token", "BTC-USD"), item);
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(request.init.body), { symbol: "BTC-USD" });
  assert.equal(request.init.headers["Content-Type"], "application/json");
  assert.equal(request.init.headers.Authorization, "Bearer synthetic-token");
});

test("DELETE targets the symbol and requires the documented empty 204 confirmation", async (context) => {
  let request;
  mockFetch(context, async (url, init) => {
    request = { url, init };
    return new Response(null, { status: 204 });
  });
  await removeWatchlistItem("synthetic-token", "BTC-USD");
  assert.equal(new URL(request.url).pathname, "/api/v1/watchlist/BTC-USD");
  assert.equal(request.init.method, "DELETE");
  assert.equal(request.init.body, undefined);
  globalThis.fetch = async () => Response.json({ data: {} });
  await assert.rejects(
    removeWatchlistItem("synthetic-token", "BTC-USD"),
    (error) => error.code === "WATCHLIST_UNAVAILABLE",
  );
});

test("invalid symbols and missing access tokens never send an API request", async (context) => {
  mockFetch(context, async () => assert.fail("invalid requests must not reach the API"));
  for (const symbol of [
    "btc-usd",
    " BTC-USD",
    "BTC-USD ",
    "../BTC-USD",
    "",
    "USD",
    "B".repeat(21) + "-USD",
  ]) {
    for (const action of [addWatchlistItem, removeWatchlistItem]) {
      await assert.rejects(
        action("synthetic-token", symbol),
        (error) => error.code === "INVALID_WATCHLIST_REQUEST",
      );
    }
  }
  await assert.rejects(fetchWatchlist(""), (error) => error.code === "UNAUTHENTICATED");
  await assert.rejects(
    addWatchlistItem("", "BTC-USD"),
    (error) => error.code === "UNAUTHENTICATED",
  );
});

test("malformed success payloads and a different saved symbol are not treated as confirmation", async (context) => {
  mockFetch(context, async () => Response.json({ data: { items: [{ symbol: "BTC-USD" }] } }));
  await assert.rejects(fetchWatchlist("synthetic-token"), WatchlistRequestError);
  globalThis.fetch = async () => Response.json({ data: { ...item, symbol: "ETH-USD" } });
  await assert.rejects(
    addWatchlistItem("synthetic-token", "BTC-USD"),
    (error) => error.code === "WATCHLIST_UNAVAILABLE",
  );
  globalThis.fetch = async () => Response.json({ data: { ...item, userId: "private" } });
  await assert.rejects(addWatchlistItem("synthetic-token", "BTC-USD"), WatchlistRequestError);
});

test("API errors have stable codes and never display server credentials or storage details", async (context) => {
  mockFetch(context, async () =>
    Response.json(
      { error: { code: "WATCHLIST_UNAVAILABLE", message: "database secret" } },
      { status: 503 },
    ),
  );
  for (const action of [
    () => fetchWatchlist("synthetic-token"),
    () => addWatchlistItem("synthetic-token", "BTC-USD"),
    () => removeWatchlistItem("synthetic-token", "BTC-USD"),
  ]) {
    await assert.rejects(
      action(),
      (error) =>
        error instanceof WatchlistRequestError && !error.message.includes("database secret"),
    );
  }
  globalThis.fetch = async () => Response.json({}, { status: 401 });
  await assert.rejects(
    addWatchlistItem("synthetic-token", "BTC-USD"),
    (error) => error.code === "UNAUTHENTICATED" && error.message.includes("Sign in"),
  );
  globalThis.fetch = async () =>
    Response.json({ error: { code: "UNSUPPORTED_SYMBOL" } }, { status: 400 });
  await assert.rejects(
    addWatchlistItem("synthetic-token", "BTC-USD"),
    (error) => error.code === "UNSUPPORTED_SYMBOL",
  );
});

test("network failures do not claim a mutation succeeded", async (context) => {
  mockFetch(context, async () => {
    throw new Error("private network details");
  });
  await assert.rejects(
    removeWatchlistItem("synthetic-token", "BTC-USD"),
    (error) =>
      error.code === "WATCHLIST_UNAVAILABLE" &&
      error.message.includes("couldn't confirm") &&
      !error.message.includes("private"),
  );
});

test("query cancellation propagates without becoming a user-facing availability error", async (context) => {
  const controller = new AbortController();
  const reason = new Error("cancelled query");
  mockFetch(context, async (_url, init) => {
    controller.abort(reason);
    assert.equal(init.signal.aborted, true);
    throw reason;
  });
  await assert.rejects(
    fetchWatchlist("synthetic-token", controller.signal),
    (error) => error === reason,
  );
});
