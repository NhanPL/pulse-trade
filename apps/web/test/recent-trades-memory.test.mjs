import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  RECENT_TRADES_LIMIT,
  recentTradesStore,
  selectRecentTrades,
} = require("../.next/realtime-test/features/realtime/stores/recent-trades-store.js");
const { RealtimeEventRouter } = require("../.next/realtime-test/lib/realtime/event-router.js");
const {
  RealtimeSubscriptionManager,
} = require("../.next/realtime-test/lib/realtime/subscription-manager.js");
const {
  subscribeToTradingMarketData,
} = require("../.next/realtime-test/features/trading/hooks/useTradingRealtimeSubscription.js");

const symbols = ["BTC-USD", "ETH-USD", "SOL-USD", "ADA-USD", "XRP-USD"];

// Synthetic transport, real validation/routing/store bindings and subscription manager.
// Keep command counters, not an ever-growing diagnostic history of commands or payloads.
class TradeTransport {
  messages = new Set();
  connections = new Set();
  connectionState = "CONNECTED";
  subscribeCommands = 0;
  unsubscribeCommands = 0;

  connect() {}

  send(payload) {
    if (this.connectionState !== "CONNECTED") return false;
    const command = JSON.parse(payload);
    if (command.action === "subscribe") this.subscribeCommands++;
    else this.unsubscribeCommands++;
    return true;
  }

  onMessage(listener) {
    this.messages.add(listener);
    return () => this.messages.delete(listener);
  }

  onConnectionState(listener) {
    this.connections.add(listener);
    listener(this.connectionState);
    return () => this.connections.delete(listener);
  }

  setState(state) {
    this.connectionState = state;
    for (const listener of this.connections) listener(state);
  }

  emit(event) {
    const payload = JSON.stringify(event);
    for (const listener of this.messages) listener(payload);
  }
}

function runtime() {
  const client = new TradeTransport();
  const eventRouter = new RealtimeEventRouter(client);
  const subscriptions = new RealtimeSubscriptionManager(client, {
    createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
  });
  return {
    client,
    eventRouter,
    subscriptions,
    destroy() {
      subscriptions.destroy();
      eventRouter.destroy();
      for (const symbol of symbols) recentTradesStore.getState().clearRecentTrades(symbol);
      assert.equal(client.messages.size, 0);
      assert.equal(client.connections.size, 0);
      assert.equal(eventRouter.eventListeners.size, 0);
      assert.equal(subscriptions.activeSubscriptionCount, 0);
    },
  };
}

function trade(index, symbol = "BTC-USD") {
  return {
    id: `${symbol}-${String(index).padStart(6, "0")}`,
    marketTs: 1_800_000_000_000 + index,
    price: String(50000 + index),
    quantity: "0.00000001",
    side: index % 2 ? "BUY" : "SELL",
  };
}

function batch(symbol, trades) {
  return { v: 1, event: "trades.batch", symbol, ts: 1_800_000_100_000, data: { trades } };
}

test("P03 retains exactly the latest 50 after 100,000 validated trades without a growing symbol map", (t) => {
  assert.equal(RECENT_TRADES_LIMIT, 50);
  const feed = runtime();
  const release = subscribeToTradingMarketData(feed, "BTC-USD");
  t.after(() => {
    release();
    feed.destroy();
  });
  const checkpoints = [];
  for (let start = 0; start < 100_000; start += 100) {
    feed.client.emit(
      batch(
        "BTC-USD",
        Array.from({ length: 100 }, (_, offset) => trade(start + offset)),
      ),
    );
    const retained = selectRecentTrades("BTC-USD")(recentTradesStore.getState());
    assert.equal(retained.length, 50);
    assert.equal(retained[0].id, trade(start + 99).id);
    assert.equal(retained.at(-1).id, trade(start + 50).id);
    assert.equal(new Set(retained.map((item) => item.id)).size, 50);
    assert.deepEqual(Object.keys(recentTradesStore.getState().recentTradesBySymbol), ["BTC-USD"]);
    if ([10_000, 50_000, 100_000].includes(start + 100)) {
      globalThis.gc?.();
      checkpoints.push({
        processed: start + 100,
        retained: retained.length,
        symbols: 1,
        // Optional GC measurements are observations, never a flaky byte/percentage assertion.
        heapUsedBytes: globalThis.gc ? process.memoryUsage().heapUsed : null,
      });
    }
  }
  t.diagnostic(
    JSON.stringify({ profile: "P03", gcAvailable: Boolean(globalThis.gc), checkpoints }),
  );
  release();
  assert.deepEqual(recentTradesStore.getState().recentTradesBySymbol, {});
});

test("P03 replay, obsolete trades and empty batches preserve the bounded buffer reference", (t) => {
  const feed = runtime();
  const release = subscribeToTradingMarketData(feed, "BTC-USD");
  t.after(() => {
    release();
    feed.destroy();
  });
  feed.client.emit(
    batch(
      "BTC-USD",
      Array.from({ length: 500 }, (_, index) => trade(index)),
    ),
  );
  const retained = selectRecentTrades("BTC-USD")(recentTradesStore.getState());
  for (let index = 0; index < 100; index++) {
    feed.client.emit(batch("BTC-USD", [...retained, ...retained]));
    feed.client.emit(
      batch(
        "BTC-USD",
        Array.from({ length: 100 }, (_, offset) => trade(offset)),
      ),
    );
    feed.client.emit(batch("BTC-USD", []));
    assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), retained);
  }
  feed.client.emit(
    batch("BTC-USD", [{ ...retained[0], marketTs: retained[0].marketTs - 1, price: "1" }]),
  );
  assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), retained);
  feed.client.emit(batch("BTC-USD", [{ ...retained[0], quantity: "0.12500000" }]));
  const corrected = selectRecentTrades("BTC-USD")(recentTradesStore.getState());
  assert.equal(corrected.length, 50);
  assert.equal(corrected[0].quantity, "0.12500000");
  assert.equal(corrected[0].id, retained[0].id);
  feed.client.emit(batch("BTC-USD", [trade(1000), { ...trade(1001), quantity: "not-a-decimal" }]));
  assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), corrected);
});

test("P03 reconnect retains data and replays once without growing buffers or listeners", (t) => {
  const feed = runtime();
  const release = subscribeToTradingMarketData(feed, "BTC-USD");
  t.after(() => {
    release();
    feed.destroy();
  });
  feed.client.emit(
    batch(
      "BTC-USD",
      Array.from({ length: 100 }, (_, index) => trade(index)),
    ),
  );
  const retained = selectRecentTrades("BTC-USD")(recentTradesStore.getState());
  for (let cycle = 1; cycle <= 100; cycle++) {
    feed.client.setState("RECONNECTING");
    assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), retained);
    feed.client.setState("CONNECTED");
    feed.client.setState("CONNECTED");
    feed.client.emit(batch("BTC-USD", retained));
    assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), retained);
    assert.equal(feed.client.subscribeCommands, cycle + 1);
    assert.equal(feed.subscriptions.activeSubscriptionCount, 1);
    assert.equal(feed.client.messages.size, 1);
    assert.equal(feed.client.connections.size, 2);
    assert.equal(feed.eventRouter.eventListeners.size, 4);
  }
  release();
  assert.equal(feed.client.connections.size, 1, "only the subscription manager remains");
  assert.equal(feed.eventRouter.eventListeners.size, 0);
  feed.client.emit(batch("BTC-USD", [trade(1000)]));
  assert.deepEqual(recentTradesStore.getState().recentTradesBySymbol, {});
});

test("P03 repeated route changes and overlapping symbols release their stored arrays", (t) => {
  const feed = runtime();
  let release = () => undefined;
  t.after(() => {
    release();
    feed.destroy();
  });
  for (let cycle = 0; cycle < 200; cycle++) {
    release();
    assert.deepEqual(recentTradesStore.getState().recentTradesBySymbol, {});
    assert.equal(feed.eventRouter.eventListeners.size, 0);
    const symbol = symbols[cycle % symbols.length];
    release = subscribeToTradingMarketData(feed, symbol);
    feed.client.emit(
      batch(
        symbol,
        Array.from({ length: 100 }, (_, index) => trade(index, symbol)),
      ),
    );
    assert.deepEqual(Object.keys(recentTradesStore.getState().recentTradesBySymbol), [symbol]);
    assert.equal(selectRecentTrades(symbol)(recentTradesStore.getState()).length, 50);
    assert.equal(feed.eventRouter.eventListeners.size, 4);
  }
  release();
  const releaseBtc = subscribeToTradingMarketData(feed, "BTC-USD");
  const releaseEth = subscribeToTradingMarketData(feed, "ETH-USD");
  try {
    feed.client.emit(batch("BTC-USD", [trade(1)]));
    feed.client.emit(batch("ETH-USD", [trade(1, "ETH-USD")]));
    const ethereum = selectRecentTrades("ETH-USD")(recentTradesStore.getState());
    releaseBtc();
    assert.deepEqual(Object.keys(recentTradesStore.getState().recentTradesBySymbol), ["ETH-USD"]);
    assert.equal(selectRecentTrades("ETH-USD")(recentTradesStore.getState()), ethereum);
    assert.equal(feed.eventRouter.eventListeners.size, 4);
  } finally {
    releaseBtc();
    releaseEth();
  }
  assert.equal(feed.eventRouter.eventListeners.size, 0);
  assert.deepEqual(recentTradesStore.getState().recentTradesBySymbol, {});
});
