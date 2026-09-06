import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { CandleAggregationService } = require("../dist/realtime/candle-aggregation.service.js");

const bucketStart = 1_700_002_800;

function tradesBatch(trades, providerSequence = 1) {
  return {
    marketTs: trades[0].marketTs,
    providerSequence,
    symbol: "BTC-USD",
    trades,
    type: "trades.batch",
  };
}

test("derives every supported candle interval from newest-first market trades", () => {
  const service = new CandleAggregationService();
  const updates = service.apply(
    tradesBatch([
      {
        id: "trade-2",
        marketTs: (bucketStart + 20) * 1_000,
        price: "102.00",
        quantity: "2.50",
        side: "BUY",
      },
      {
        id: "trade-1",
        marketTs: (bucketStart + 10) * 1_000,
        price: "100.00",
        quantity: "1.25",
        side: "SELL",
      },
    ]),
  );

  assert.deepEqual(
    updates.map((event) => event.interval),
    ["1m", "5m", "15m", "1h"],
  );
  for (const update of updates) {
    assert.deepEqual(update.candle, {
      close: "102.00",
      high: "102.00",
      low: "100.00",
      open: "100.00",
      time: bucketStart,
      volume: "3.75",
    });
  }
});

test("deduplicates replayed trades and opens a new candle at an interval boundary", () => {
  const service = new CandleAggregationService();
  const firstBatch = tradesBatch([
    {
      id: "trade-1",
      marketTs: (bucketStart + 10) * 1_000,
      price: "100",
      quantity: "1",
      side: "BUY",
    },
  ]);

  service.apply(firstBatch);
  assert.deepEqual(service.apply(firstBatch), []);

  const updates = service.apply(
    tradesBatch(
      [
        {
          id: "trade-2",
          marketTs: (bucketStart + 60) * 1_000,
          price: "101",
          quantity: "2",
          side: "BUY",
        },
      ],
      2,
    ),
  );

  const oneMinute = updates.find((event) => event.interval === "1m");
  const fiveMinute = updates.find((event) => event.interval === "5m");
  assert.deepEqual(oneMinute?.candle, {
    close: "101",
    high: "101",
    low: "101",
    open: "101",
    time: bucketStart + 60,
    volume: "2",
  });
  assert.deepEqual(fiveMinute?.candle, {
    close: "101",
    high: "101",
    low: "100",
    open: "100",
    time: bucketStart,
    volume: "3",
  });
});

test("seeds the active candle before applying subsequent live trades", () => {
  const service = new CandleAggregationService();
  service.seed(
    "BTC-USD",
    "1m",
    {
      close: "101",
      high: "105",
      low: "99",
      open: "100",
      time: bucketStart,
      volume: "10",
    },
    bucketStart * 1_000,
  );

  const update = service
    .apply(
      tradesBatch([
        {
          id: "trade-1",
          marketTs: (bucketStart + 30) * 1_000,
          price: "103",
          quantity: "2.5",
          side: "BUY",
        },
      ]),
    )
    .find((event) => event.interval === "1m");

  assert.deepEqual(update?.candle, {
    close: "103",
    high: "105",
    low: "99",
    open: "100",
    time: bucketStart,
    volume: "12.5",
  });
});
