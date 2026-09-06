import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  bindTickerStore,
  selectTicker,
  tickerFromEvent,
  tickerStore,
} = require("../.next/realtime-test/features/realtime/stores/ticker-store.js");

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

function createTickerEvent({
  marketTs = 1_700_000_000_000,
  price = "100",
  symbol = "BTC-USD",
  ts = marketTs,
} = {}) {
  return {
    data: {
      change24hPercent: "1.25",
      high24h: "110",
      low24h: "90",
      marketTs,
      price,
      volume24h: "25",
    },
    event: "ticker.update",
    symbol,
    ts,
    v: 1,
  };
}

function resetStore() {
  tickerStore.setState({ tickers: {} });
}

test("stores the latest ticker by symbol without replacing other symbol entries", () => {
  resetStore();
  const btcTicker = tickerFromEvent(createTickerEvent());
  tickerStore.getState().updateTicker(btcTicker);
  const storedBtcTicker = tickerStore.getState().tickers["BTC-USD"];

  tickerStore
    .getState()
    .updateTicker(tickerFromEvent(createTickerEvent({ price: "50", symbol: "ETH-USD" })));

  assert.equal(tickerStore.getState().tickers["BTC-USD"], storedBtcTicker);
  assert.deepEqual(selectTicker("ETH-USD")(tickerStore.getState()), {
    ...tickerFromEvent(createTickerEvent({ price: "50", symbol: "ETH-USD" })),
  });
  resetStore();
});

test("ignores duplicate and out-of-order ticker updates", () => {
  resetStore();
  const freshTicker = tickerFromEvent(createTickerEvent({ marketTs: 200, price: "200", ts: 300 }));
  tickerStore.getState().updateTicker(freshTicker);
  const storedTicker = tickerStore.getState().tickers["BTC-USD"];

  tickerStore
    .getState()
    .updateTicker(tickerFromEvent(createTickerEvent({ marketTs: 199, price: "199", ts: 400 })));
  tickerStore
    .getState()
    .updateTicker(tickerFromEvent(createTickerEvent({ marketTs: 200, price: "201", ts: 300 })));

  assert.equal(tickerStore.getState().tickers["BTC-USD"], storedTicker);
  assert.equal(tickerStore.getState().tickers["BTC-USD"].price, "200");
  resetStore();
});

test("binds only ticker events from the validated event router and cleans up", () => {
  resetStore();
  const source = new FakeRealtimeEventSource();
  const unbind = bindTickerStore(source);

  source.emit({ event: "market.live" });
  assert.equal(tickerStore.getState().tickers["BTC-USD"], undefined);

  source.emit(createTickerEvent({ price: "101" }));
  assert.equal(tickerStore.getState().tickers["BTC-USD"].price, "101");

  unbind();
  source.emit(createTickerEvent({ marketTs: 2_000, price: "102" }));
  assert.equal(tickerStore.getState().tickers["BTC-USD"].price, "101");
  assert.equal(source.listeners.size, 0);
  resetStore();
});
