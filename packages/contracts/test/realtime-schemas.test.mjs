import assert from "node:assert/strict";
import test from "node:test";

import {
  realtimeCommandSchema,
  realtimeEventSchema,
  subscribeCommandSchema,
} from "../dist/index.js";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const connectionId = "123e4567-e89b-42d3-a456-426614174001";
const envelope = { ts: 1_787_840_000_000, v: 1 };
const candle = {
  close: "67542.31",
  high: "67600.00",
  low: "67320.00",
  open: "67400.00",
  time: 1_787_839_980,
  volume: "12.4",
};

test("parses each client command variant", () => {
  assert.deepEqual(
    realtimeCommandSchema.parse({
      action: "subscribe",
      channels: ["ticker", "candles", "orderbook", "trades"],
      options: { candleInterval: "1m" },
      requestId,
      symbols: ["BTC-USD"],
    }),
    {
      action: "subscribe",
      channels: ["ticker", "candles", "orderbook", "trades"],
      options: { candleInterval: "1m" },
      requestId,
      symbols: ["BTC-USD"],
    },
  );

  assert.equal(
    realtimeCommandSchema.parse({
      action: "unsubscribe",
      channels: ["ticker"],
      requestId,
      symbols: ["ETH-USD"],
    }).action,
    "unsubscribe",
  );

  assert.equal(realtimeCommandSchema.parse({ action: "ping", ts: envelope.ts }).action, "ping");
});

test("rejects malformed or oversized client commands", () => {
  const valid = {
    action: "subscribe",
    channels: ["ticker"],
    requestId,
    symbols: ["BTC-USD"],
  };

  assert.equal(subscribeCommandSchema.safeParse({ ...valid, symbols: [] }).success, false);
  assert.equal(subscribeCommandSchema.safeParse({ ...valid, symbols: ["btc-usd"] }).success, false);
  assert.equal(
    subscribeCommandSchema.safeParse({ ...valid, requestId: "not-a-uuid" }).success,
    false,
  );
  assert.equal(
    subscribeCommandSchema.safeParse({ ...valid, channels: ["unknown"] }).success,
    false,
  );
  assert.equal(subscribeCommandSchema.safeParse({ ...valid, extra: true }).success, false);
  assert.equal(
    subscribeCommandSchema.safeParse({ ...valid, symbols: Array(51).fill("BTC-USD") }).success,
    false,
  );
});

test("parses every server event variant", () => {
  const events = [
    {
      ...envelope,
      data: { accepted: true, requestId },
      event: "subscription.ack",
    },
    {
      ...envelope,
      data: { connectionId },
      event: "connection.ready",
    },
    {
      ...envelope,
      data: {
        change24hPercent: "2.41",
        high24h: "68100.00",
        low24h: "64821.00",
        marketTs: 1_787_839_999_900,
        price: "67542.31",
        volume24h: "12345.67",
      },
      event: "ticker.update",
      symbol: "BTC-USD",
    },
    {
      ...envelope,
      data: { candles: [candle], interval: "1m" },
      event: "candle.snapshot",
      symbol: "BTC-USD",
    },
    {
      ...envelope,
      data: { candle, interval: "1m" },
      event: "candle.update",
      symbol: "BTC-USD",
    },
    {
      ...envelope,
      data: {
        asks: [["67550.00", "0.31000000"]],
        bids: [["67540.00", "0.22000000"]],
        sequence: "123456",
      },
      event: "orderbook.snapshot",
      symbol: "BTC-USD",
    },
    {
      ...envelope,
      data: {
        changes: [{ price: "67540.00", quantity: "0", side: "BID" }],
        sequence: "123457",
      },
      event: "orderbook.update",
      symbol: "BTC-USD",
    },
    {
      ...envelope,
      data: {
        trades: [
          {
            id: "trade-1",
            marketTs: 1_787_839_999_900,
            price: "67542.31",
            quantity: "0.012",
            side: "BUY",
          },
        ],
      },
      event: "trades.batch",
      symbol: "BTC-USD",
    },
    {
      ...envelope,
      data: {
        lastUpdateTs: 1_787_839_900_000,
        reason: "UPSTREAM_DISCONNECTED",
      },
      event: "market.stale",
      symbol: "BTC-USD",
    },
    {
      ...envelope,
      data: {},
      event: "market.live",
      symbol: "BTC-USD",
    },
    {
      ...envelope,
      data: {
        code: "UNSUPPORTED_SYMBOL",
        message: "Unsupported market symbol.",
        requestId,
      },
      event: "error",
    },
  ];

  for (const event of events) {
    assert.equal(realtimeEventSchema.parse(event).event, event.event);
  }
});

test("rejects unsafe envelopes and malformed event payloads", () => {
  const ticker = {
    ...envelope,
    data: {
      change24hPercent: "2.41",
      high24h: "68100.00",
      low24h: "64821.00",
      marketTs: 1_787_839_999_900,
      price: "67542.31",
      volume24h: "12345.67",
    },
    event: "ticker.update",
    symbol: "BTC-USD",
  };

  assert.equal(realtimeEventSchema.safeParse({ ...ticker, v: 2 }).success, false);
  assert.equal(realtimeEventSchema.safeParse({ ...ticker, ts: -1 }).success, false);
  assert.equal(realtimeEventSchema.safeParse({ ...ticker, symbol: "btc-usd" }).success, false);
  assert.equal(
    realtimeEventSchema.safeParse({ ...ticker, data: { ...ticker.data, price: "NaN" } }).success,
    false,
  );
  assert.equal(realtimeEventSchema.safeParse({ ...ticker, extra: true }).success, false);
  assert.equal(
    realtimeEventSchema.safeParse({
      ...envelope,
      data: { code: "INVALID_COMMAND", message: "Invalid command." },
      event: "error",
    }).success,
    false,
  );
  assert.equal(
    realtimeEventSchema.safeParse({
      ...envelope,
      data: { changes: [{ price: "1", quantity: "1", side: "BUY" }], sequence: "01" },
      event: "orderbook.update",
      symbol: "BTC-USD",
    }).success,
    false,
  );
  assert.equal(
    realtimeEventSchema.safeParse({ ...envelope, data: {}, event: "unknown" }).success,
    false,
  );
});
