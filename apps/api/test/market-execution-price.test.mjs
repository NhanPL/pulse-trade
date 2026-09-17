import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  MarketExecutionPriceService,
} = require("../dist/trading/market-execution-price.service.js");
const { MarketOrderError } = require("../dist/trading/market-order.error.js");

function createService({ price, freshnessEvent }) {
  return new MarketExecutionPriceService(
    {
      getTicker() {
        return price === undefined ? undefined : { price };
      },
    },
    {
      getCurrentEvent() {
        return freshnessEvent;
      },
    },
  );
}

test("uses a backend ticker only after the realtime freshness service confirms the market is live", () => {
  const service = createService({
    freshnessEvent: { event: "market.live" },
    price: "67542.31000000",
  });

  assert.equal(service.getPrice("BTC-USD"), "67542.31");
});

test("rejects cached prices when market freshness is stale or has not confirmed a live update", () => {
  for (const freshnessEvent of [{ event: "market.stale" }, undefined]) {
    const service = createService({ freshnessEvent, price: "67542.31" });
    assert.throws(
      () => service.getPrice("BTC-USD"),
      (error) => error instanceof MarketOrderError && error.code === "MARKET_DATA_STALE",
    );
  }
});

test("keeps missing or malformed ticker prices distinct from stale market data", () => {
  for (const price of [undefined, "not-a-decimal", "0"]) {
    const service = createService({ freshnessEvent: { event: "market.live" }, price });
    assert.throws(
      () => service.getPrice("BTC-USD"),
      (error) => error instanceof MarketOrderError && error.code === "MARKET_DATA_UNAVAILABLE",
    );
  }
});
