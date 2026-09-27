import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  findOrderBalance,
  formatOrderBalance,
} = require("../.next/realtime-test/features/trading/model/order-balance.js");

const portfolio = {
  balances: [
    { asset: "BTC", available: "0.04", locked: "0.01" },
    { asset: "USD", available: "8500", locked: "1500" },
  ],
  cash: { available: "8500", locked: "1500" },
  positions: [],
  quoteCurrency: "USD",
};

test("selects persisted wallet state and treats a missing asset as an actual zero balance", () => {
  assert.deepEqual(findOrderBalance(portfolio, "BTC"), {
    asset: "BTC",
    available: "0.04",
    locked: "0.01",
  });
  assert.deepEqual(findOrderBalance(portfolio, "ETH"), {
    asset: "ETH",
    available: "0",
    locked: "0",
  });
});

test("formats quote and base balances without binary floating-point arithmetic", () => {
  assert.equal(formatOrderBalance("8500.126", "USD", "USD"), "$8,500.13");
  assert.equal(formatOrderBalance("0.04000000", "BTC", "USD"), "0.04 BTC");
  assert.equal(formatOrderBalance("0.000000001", "BTC", "USD"), "<0.00000001 BTC");
  assert.equal(formatOrderBalance("not-a-decimal", "BTC", "USD"), "— BTC");
});
