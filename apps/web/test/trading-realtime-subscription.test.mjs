import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  subscribeToTradingCandles,
  subscribeToTradingMarketData,
  subscribeToTradingMarket,
} = require("../.next/realtime-test/features/trading/hooks/useTradingRealtimeSubscription.js");
const {
  flushOrderBookPresentation,
  orderBookStore,
  selectOrderBook,
} = require("../.next/realtime-test/features/realtime/stores/order-book-store.js");
const {
  candleStore,
  selectCurrentCandle,
} = require("../.next/realtime-test/features/realtime/stores/candle-store.js");
const {
  recentTradesStore,
  selectRecentTrades,
} = require("../.next/realtime-test/features/realtime/stores/recent-trades-store.js");

class FakeRealtimeClient {
  listeners = new Set();
  state = "DISCONNECTED";

  get connectionState() {
    return this.state;
  }

  onConnectionState(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
}

class FakeEventRouter {
  listeners = new Set();

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function createRuntime() {
  const subscriptions = [];
  const client = new FakeRealtimeClient();
  const eventRouter = new FakeEventRouter();

  return {
    client,
    eventRouter,
    subscriptions: {
      subscribe(request) {
        const subscription = { released: false, request };
        subscriptions.push(subscription);
        return () => {
          subscription.released = true;
        };
      },
    },
    trackedSubscriptions: subscriptions,
  };
}

function resetStores() {
  candleStore.getState().clearCandles("BTC-USD");
  candleStore.getState().clearCandles("ETH-USD");
  candleStore.getState().clearCandles("SOL-USD");
  orderBookStore.getState().clearOrderBook("BTC-USD");
  orderBookStore.getState().clearOrderBook("ETH-USD");
  recentTradesStore.getState().clearRecentTrades("BTC-USD");
  recentTradesStore.getState().clearRecentTrades("ETH-USD");
  flushOrderBookPresentation();
}

test("subscribes to the trading channels and releases symbol state on cleanup", () => {
  resetStores();
  orderBookStore.getState().applySnapshot({
    data: { asks: [], bids: [["100", "1"]], sequence: "10" },
    event: "orderbook.snapshot",
    symbol: "BTC-USD",
    ts: 1,
    v: 1,
  });
  recentTradesStore
    .getState()
    .updateRecentTrades("BTC-USD", [
      { id: "trade", marketTs: 1, price: "100", quantity: "1", side: "BUY" },
    ]);
  candleStore.getState().applyUpdate({
    data: {
      candle: { close: "101", high: "102", low: "99", open: "100", time: 100, volume: "10" },
      interval: "1m",
    },
    event: "candle.update",
    symbol: "BTC-USD",
    ts: 1,
    v: 1,
  });
  flushOrderBookPresentation();

  const runtime = createRuntime();
  const release = subscribeToTradingMarket(runtime, "BTC-USD");
  assert.deepEqual(runtime.trackedSubscriptions[0]?.request, {
    channels: ["ticker", "orderbook", "trades"],
    symbols: ["BTC-USD"],
  });
  assert.deepEqual(runtime.trackedSubscriptions[1]?.request, {
    channels: ["candles"],
    options: { candleInterval: "1m" },
    symbols: ["BTC-USD"],
  });
  assert.equal(runtime.client.listeners.size, 1);
  assert.equal(runtime.eventRouter.listeners.size, 4);

  release();
  release();
  assert.equal(runtime.trackedSubscriptions[0]?.released, true);
  assert.equal(runtime.trackedSubscriptions[1]?.released, true);
  assert.equal(selectCurrentCandle("BTC-USD", "1m")(candleStore.getState()), undefined);
  assert.equal(selectOrderBook("BTC-USD")(orderBookStore.getState()), undefined);
  assert.deepEqual(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), []);
  assert.equal(runtime.client.listeners.size, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
});

test("keeps shared store bindings while symbol subscriptions overlap", () => {
  resetStores();
  const runtime = createRuntime();
  const releaseBtc = subscribeToTradingMarket(runtime, "BTC-USD");
  const releaseEth = subscribeToTradingMarket(runtime, "ETH-USD");

  assert.equal(runtime.trackedSubscriptions.length, 4);
  assert.equal(runtime.client.listeners.size, 1);
  assert.equal(runtime.eventRouter.listeners.size, 4);

  releaseBtc();
  assert.equal(runtime.trackedSubscriptions[0]?.released, true);
  assert.equal(runtime.trackedSubscriptions[1]?.released, true);
  assert.equal(runtime.client.listeners.size, 1);
  assert.equal(runtime.eventRouter.listeners.size, 4);

  releaseEth();
  assert.equal(runtime.trackedSubscriptions[2]?.released, true);
  assert.equal(runtime.trackedSubscriptions[3]?.released, true);
  assert.equal(runtime.client.listeners.size, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
});

test("does not accumulate listeners when the trading route repeatedly changes symbols", () => {
  resetStores();
  const runtime = createRuntime();
  const symbols = ["BTC-USD", "ETH-USD", "SOL-USD", "BTC-USD", "ETH-USD"];
  let releaseCurrentRoute;

  for (const symbol of symbols) {
    releaseCurrentRoute?.();
    assert.equal(runtime.client.listeners.size, 0);
    assert.equal(runtime.eventRouter.listeners.size, 0);

    releaseCurrentRoute = subscribeToTradingMarket(runtime, symbol);
    assert.equal(runtime.client.listeners.size, 1);
    assert.equal(runtime.eventRouter.listeners.size, 4);
  }

  releaseCurrentRoute?.();

  assert.equal(runtime.trackedSubscriptions.length, symbols.length * 2);
  assert.ok(runtime.trackedSubscriptions.every((subscription) => subscription.released));
  assert.equal(runtime.client.listeners.size, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
});

test("replaces only the candle subscription when the timeframe changes", () => {
  resetStores();
  const runtime = createRuntime();
  const releaseMarketData = subscribeToTradingMarketData(runtime, "BTC-USD");
  const releaseOneMinuteCandles = subscribeToTradingCandles(runtime, "BTC-USD", "1m");

  releaseOneMinuteCandles();
  const releaseFiveMinuteCandles = subscribeToTradingCandles(runtime, "BTC-USD", "5m");

  assert.deepEqual(runtime.trackedSubscriptions[0]?.request, {
    channels: ["ticker", "orderbook", "trades"],
    symbols: ["BTC-USD"],
  });
  assert.deepEqual(runtime.trackedSubscriptions[1]?.request, {
    channels: ["candles"],
    options: { candleInterval: "1m" },
    symbols: ["BTC-USD"],
  });
  assert.deepEqual(runtime.trackedSubscriptions[2]?.request, {
    channels: ["candles"],
    options: { candleInterval: "5m" },
    symbols: ["BTC-USD"],
  });
  assert.equal(runtime.trackedSubscriptions[0]?.released, false);
  assert.equal(runtime.trackedSubscriptions[1]?.released, true);
  assert.equal(runtime.trackedSubscriptions[2]?.released, false);
  assert.equal(runtime.client.listeners.size, 1);
  assert.equal(runtime.eventRouter.listeners.size, 4);

  releaseFiveMinuteCandles();
  releaseMarketData();

  assert.equal(runtime.client.listeners.size, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
});
