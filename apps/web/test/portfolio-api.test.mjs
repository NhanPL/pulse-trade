import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  fetchPortfolio,
  PortfolioRequestError,
} = require("../.next/realtime-test/features/portfolio/api/portfolio.js");

const response = {
  data: {
    cash: { available: "4000", locked: "1000" },
    positions: [{ asset: "BTC", averageCost: "60000", quantity: "0.05", realizedPnl: "100" }],
    quoteCurrency: "USD",
  },
};

test("loads and validates an authenticated portfolio snapshot", async (context) => {
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

  assert.deepEqual(await fetchPortfolio("access-token"), response.data);
  assert.equal(request.url, "http://localhost:3001/api/v1/portfolio");
  assert.equal(request.init.headers.Authorization, "Bearer access-token");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.credentials, "include");
});

test("rejects malformed portfolio responses instead of trusting TypeScript types", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: { ...response.data, quoteCurrency: "EUR" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    fetchPortfolio("access-token"),
    (error) => error instanceof PortfolioRequestError && error.code === "PORTFOLIO_UNAVAILABLE",
  );
});

test("maps API failures to stable portfolio errors without exposing server messages", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { code: "PORTFOLIO_UNAVAILABLE", message: "database secret" } }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );

  await assert.rejects(
    fetchPortfolio("access-token"),
    (error) =>
      error instanceof PortfolioRequestError &&
      error.code === "PORTFOLIO_UNAVAILABLE" &&
      !error.message.includes("database secret"),
  );
});
