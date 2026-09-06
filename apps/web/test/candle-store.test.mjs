import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  bindCandleStore,
  candleStore,
  selectCurrentCandle,
} = require("../.next/realtime-test/features/realtime/stores/candle-store.js");

class FakeEventRouter {
  listeners = new Set();

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function clearTestCandles() {
  candleStore.getState().clearCandles("BTC-USD");
  candleStore.getState().clearCandles("ETH-USD");
}

test("keeps the latest realtime candle per symbol and interval", () => {
  clearTestCandles();
  const router = new FakeEventRouter();
  const release = bindCandleStore(router);

  router.emit({
    data: {
      candles: [
        { close: "101", high: "102", low: "99", open: "100", time: 100, volume: "10" },
        { close: "111", high: "112", low: "109", open: "110", time: 120, volume: "12" },
      ],
      interval: "1m",
    },
    event: "candle.snapshot",
    symbol: "BTC-USD",
    ts: 10,
    v: 1,
  });
  router.emit({
    data: {
      candle: { close: "113", high: "114", low: "109", open: "110", time: 120, volume: "13" },
      interval: "1m",
    },
    event: "candle.update",
    symbol: "BTC-USD",
    ts: 11,
    v: 1,
  });
  router.emit({
    data: {
      candle: { close: "100", high: "101", low: "98", open: "99", time: 100, volume: "9" },
      interval: "1m",
    },
    event: "candle.update",
    symbol: "BTC-USD",
    ts: 12,
    v: 1,
  });
  router.emit({
    data: {
      candle: { close: "120", high: "121", low: "119", open: "120", time: 120, volume: "8" },
      interval: "5m",
    },
    event: "candle.update",
    symbol: "BTC-USD",
    ts: 13,
    v: 1,
  });

  assert.deepEqual(selectCurrentCandle("BTC-USD", "1m")(candleStore.getState()), {
    candle: { close: "113", high: "114", low: "109", open: "110", time: 120, volume: "13" },
    eventTs: 11,
  });
  assert.deepEqual(selectCurrentCandle("BTC-USD", "5m")(candleStore.getState()), {
    candle: { close: "120", high: "121", low: "119", open: "120", time: 120, volume: "8" },
    eventTs: 13,
  });

  candleStore.getState().clearCandles("BTC-USD");
  assert.equal(selectCurrentCandle("BTC-USD", "1m")(candleStore.getState()), undefined);
  assert.equal(selectCurrentCandle("BTC-USD", "5m")(candleStore.getState()), undefined);

  release();
  assert.equal(router.listeners.size, 0);
});
