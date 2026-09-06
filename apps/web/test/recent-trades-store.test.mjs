import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  RECENT_TRADES_LIMIT,
  bindRecentTradesStore,
  recentTradesStore,
  selectRecentTrades,
} = require("../.next/realtime-test/features/realtime/stores/recent-trades-store.js");

class FakeRealtimeEventSource {
  listeners = new Set();

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function createTrade({ id, marketTs, price = "100", quantity = "1", side = "BUY" }) {
  return { id, marketTs, price, quantity, side };
}

function createTradesBatchEvent({ symbol = "BTC-USD", trades }) {
  return {
    data: { trades },
    event: "trades.batch",
    symbol,
    ts: 1_700_000_000_000,
    v: 1,
  };
}

function resetStore() {
  recentTradesStore.getState().clearRecentTrades("BTC-USD");
  recentTradesStore.getState().clearRecentTrades("ETH-USD");
}

test("deduplicates batches, keeps the newest version, and sorts newest first", () => {
  resetStore();
  recentTradesStore
    .getState()
    .updateRecentTrades("BTC-USD", [
      createTrade({ id: "first", marketTs: 100 }),
      createTrade({ id: "second", marketTs: 200 }),
    ]);
  recentTradesStore
    .getState()
    .updateRecentTrades("BTC-USD", [
      createTrade({ id: "first", marketTs: 300, price: "101" }),
      createTrade({ id: "third", marketTs: 250 }),
    ]);

  assert.deepEqual(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), [
    createTrade({ id: "first", marketTs: 300, price: "101" }),
    createTrade({ id: "third", marketTs: 250 }),
    createTrade({ id: "second", marketTs: 200 }),
  ]);
  const storedTrades = selectRecentTrades("BTC-USD")(recentTradesStore.getState());
  recentTradesStore
    .getState()
    .updateRecentTrades("BTC-USD", [createTrade({ id: "second", marketTs: 200 })]);
  assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), storedTrades);
  resetStore();
});

test("keeps each symbol buffer bounded while preserving other symbol references", () => {
  resetStore();
  recentTradesStore.getState().updateRecentTrades(
    "BTC-USD",
    Array.from({ length: RECENT_TRADES_LIMIT + 5 }, (_, index) =>
      createTrade({ id: `trade-${index}`, marketTs: index }),
    ),
  );
  const btcTrades = selectRecentTrades("BTC-USD")(recentTradesStore.getState());

  recentTradesStore
    .getState()
    .updateRecentTrades("ETH-USD", [createTrade({ id: "eth-trade", marketTs: 1 })]);

  assert.equal(btcTrades.length, RECENT_TRADES_LIMIT);
  assert.equal(btcTrades[0]?.id, `trade-${RECENT_TRADES_LIMIT + 4}`);
  assert.equal(btcTrades.at(-1)?.id, "trade-5");
  assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), btcTrades);
  resetStore();
});

test("routes only trades batches and removes the router listener during cleanup", () => {
  resetStore();
  const source = new FakeRealtimeEventSource();
  const unbind = bindRecentTradesStore(source);

  source.emit({ event: "ticker.update" });
  assert.deepEqual(selectRecentTrades("BTC-USD")(recentTradesStore.getState()), []);

  source.emit(
    createTradesBatchEvent({
      trades: [createTrade({ id: "live-trade", marketTs: 100 })],
    }),
  );
  assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState())[0]?.id, "live-trade");

  unbind();
  source.emit(
    createTradesBatchEvent({
      trades: [createTrade({ id: "must-not-arrive", marketTs: 200 })],
    }),
  );
  assert.equal(selectRecentTrades("BTC-USD")(recentTradesStore.getState()).length, 1);
  assert.equal(source.listeners.size, 0);
  resetStore();
});
