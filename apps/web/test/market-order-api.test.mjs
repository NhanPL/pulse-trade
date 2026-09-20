import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  MarketOrderSubmissionError,
  marketOrderSubmissionMessage,
  submitMarketOrder,
} = require("../.next/realtime-test/features/trading/api/market-order.js");

const request = {
  accessToken: "access-token",
  quantity: "0.01",
  side: "BUY",
  symbol: "BTC-USD",
  type: "MARKET",
};

test("submits a strict market order with the in-memory bearer token", async (t) => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { init, url };
    return {
      json: async () => ({
        data: {
          avgFillPrice: "67542.31",
          id: "123e4567-e89b-42d3-a456-426614174000",
          quantity: "0.01",
          side: "BUY",
          status: "FILLED",
          symbol: "BTC-USD",
          type: "MARKET",
        },
      }),
      ok: true,
      status: 201,
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const filled = await submitMarketOrder(request);

  assert.equal(captured.url, "http://localhost:3001/api/v1/orders");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.credentials, "omit");
  assert.equal(captured.init.headers.Authorization, "Bearer access-token");
  assert.deepEqual(JSON.parse(captured.init.body), {
    quantity: "0.01",
    side: "BUY",
    symbol: "BTC-USD",
    type: "MARKET",
  });
  assert.equal(captured.init.body.includes("access-token"), false);
  assert.equal(filled.avgFillPrice, "67542.31");
});

test("surfaces stable API error codes without exposing server text", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    json: async () => ({
      error: {
        code: "MARKET_DATA_STALE",
        message: "provider connection state and internal details",
      },
    }),
    ok: false,
    status: 503,
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(submitMarketOrder(request), (error) => {
    assert.ok(error instanceof MarketOrderSubmissionError);
    assert.equal(error.code, "MARKET_DATA_STALE");
    assert.equal(error.message, marketOrderSubmissionMessage("MARKET_DATA_STALE"));
    assert.equal(error.message.includes("internal details"), false);
    return true;
  });
});

test("rejects invalid client values before sending an order request", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("must not request");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(submitMarketOrder({ ...request, quantity: "0" }), (error) => {
    assert.ok(error instanceof MarketOrderSubmissionError);
    assert.equal(error.code, "INVALID_QUANTITY");
    return true;
  });
  assert.equal(calls, 0);
});
