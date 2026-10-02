import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  fetchOrders,
  cancelOrder,
  OrdersRequestError,
} = require("../.next/realtime-test/features/orders/api/orders.js");

test("cancels the identified order using the authenticated POST and validates confirmation", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const data = { id: firstOrderId, status: "CANCELLED", cancelledAt: "2026-10-02T00:00:00.000Z" };
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return Response.json({ data });
  };
  assert.deepEqual(await cancelOrder("access-token", firstOrderId), data);
  assert.equal(new URL(request.url).pathname, `/api/v1/orders/${firstOrderId}/cancel`);
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer access-token");
  assert.equal(request.init.credentials, "include");
  await assert.rejects(
    cancelOrder("access-token", "invalid-id"),
    (error) => error.code === "INVALID_ORDER",
  );
  globalThis.fetch = async () =>
    Response.json({ data: { ...data, id: "123e4567-e89b-42d3-a456-426614174099" } });
  await assert.rejects(
    cancelOrder("access-token", firstOrderId),
    (error) => error.code === "CANCELLATION_UNAVAILABLE",
  );
});

test("cancellation errors remain sanitized and network failures do not claim success", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "ORDER_UNAVAILABLE", message: "database secret" } },
      { status: 503 },
    );
  await assert.rejects(
    cancelOrder("access-token", firstOrderId),
    (error) => error instanceof OrdersRequestError && !error.message.includes("database secret"),
  );
  globalThis.fetch = async () => {
    throw new Error("network");
  };
  await assert.rejects(
    cancelOrder("access-token", firstOrderId),
    (error) =>
      error.code === "CANCELLATION_UNAVAILABLE" && error.message.includes("couldn't confirm"),
  );
});

const firstOrderId = "123e4567-e89b-42d3-a456-426614174010";
const response = {
  data: {
    items: [
      {
        avgFillPrice: null,
        cancelledAt: null,
        createdAt: "2026-09-27T00:00:00.000Z",
        filledAt: null,
        filledQuantity: "0",
        id: firstOrderId,
        limitPrice: "65000",
        quantity: "0.01",
        side: "BUY",
        status: "PENDING",
        symbol: "BTC-USD",
        type: "LIMIT",
      },
    ],
    nextCursor: firstOrderId,
  },
};

test("loads and validates an authenticated orders page with filters", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  assert.deepEqual(
    await fetchOrders("access-token", {
      cursor: firstOrderId,
      limit: 20,
      side: "BUY",
      status: "PENDING",
      symbol: "BTC-USD",
    }),
    response.data,
  );
  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, "http://localhost:3001/api/v1/orders");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    cursor: firstOrderId,
    limit: "20",
    side: "BUY",
    status: "PENDING",
    symbol: "BTC-USD",
  });
  assert.equal(request.init.headers.Authorization, "Bearer access-token");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.credentials, "include");
});

test("rejects invalid requests before sending account credentials", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    assert.fail("invalid pagination must not reach the API");
  };

  await assert.rejects(
    fetchOrders("access-token", { limit: 0, status: "PENDING" }),
    (error) => error instanceof OrdersRequestError && error.code === "INVALID_ORDERS_QUERY",
  );
  assert.equal(calls, 0);
});

test("rejects malformed success payloads and sanitizes API failures", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: { items: [{ quantity: 0.01 }], nextCursor: null } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  await assert.rejects(
    fetchOrders("access-token", { limit: 20, status: "PENDING" }),
    (error) => error instanceof OrdersRequestError && error.code === "ORDERS_UNAVAILABLE",
  );

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { code: "ORDERS_UNAVAILABLE", message: "database secret" } }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  await assert.rejects(
    fetchOrders("access-token", { limit: 20, status: "PENDING" }),
    (error) =>
      error instanceof OrdersRequestError &&
      error.code === "ORDERS_UNAVAILABLE" &&
      !error.message.includes("database secret"),
  );
});
