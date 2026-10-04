import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  subscribeToWatchlistTickers,
} = require("../.next/realtime-test/features/watchlist/hooks/useWatchlistRealtime.js");
const {
  RealtimeSubscriptionManager,
} = require("../.next/realtime-test/lib/realtime/subscription-manager.js");

class FakeRealtimeClient {
  listeners = new Set();
  payloads = [];
  state = "CONNECTED";
  connectCalls = 0;
  get connectionState() {
    return this.state;
  }
  connect() {
    this.connectCalls++;
  }
  onConnectionState(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  send(payload) {
    if (this.state !== "CONNECTED") return false;
    this.payloads.push(JSON.parse(payload));
    return true;
  }
  setState(state) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function harness() {
  const client = new FakeRealtimeClient();
  const listeners = new Set();
  const subscriptions = new RealtimeSubscriptionManager(client);
  return {
    client,
    subscriptions,
    eventRouter: {
      listeners,
      onEvent(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}

test("watchlist requests only unique saved tickers and releases subscriptions/listeners once", () => {
  const runtime = harness();
  const release = subscribeToWatchlistTickers(runtime, ["ETH-USD", "BTC-USD", "ETH-USD"]);
  assert.deepEqual(runtime.client.payloads[0].channels, ["ticker"]);
  assert.deepEqual(runtime.client.payloads[0].symbols, ["BTC-USD", "ETH-USD"]);
  assert.equal(runtime.eventRouter.listeners.size, 4);
  release();
  release();
  assert.equal(runtime.subscriptions.activeSubscriptionCount, 0);
  assert.equal(runtime.client.payloads.length, 2);
  assert.equal(runtime.client.payloads[1].action, "unsubscribe");
  assert.equal(runtime.eventRouter.listeners.size, 0);
  assert.equal(runtime.client.listeners.size, 1); // Shared manager retains its own lifecycle listener.
  runtime.subscriptions.destroy();
  assert.equal(runtime.client.listeners.size, 0);
});

test("an empty watchlist does not connect or acquire store bindings", () => {
  const runtime = harness();
  subscribeToWatchlistTickers(runtime, [])();
  assert.equal(runtime.client.connectCalls, 0);
  assert.equal(runtime.client.payloads.length, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
  runtime.subscriptions.destroy();
});

test("overlapping owners share bindings and canonical subscriptions until final cleanup", () => {
  const runtime = harness();
  const first = subscribeToWatchlistTickers(runtime, ["BTC-USD", "ETH-USD"]);
  const second = subscribeToWatchlistTickers(runtime, ["ETH-USD", "BTC-USD"]);
  assert.equal(runtime.client.payloads.length, 1);
  first();
  assert.equal(runtime.eventRouter.listeners.size, 4);
  assert.equal(runtime.client.payloads.length, 1);
  second();
  assert.equal(runtime.client.payloads.length, 2);
  assert.equal(runtime.eventRouter.listeners.size, 0);
  runtime.subscriptions.destroy();
});

test("changing membership then reconnecting re-subscribes only the current saved symbols", () => {
  const runtime = harness();
  const old = subscribeToWatchlistTickers(runtime, ["BTC-USD", "ETH-USD"]);
  old();
  const current = subscribeToWatchlistTickers(runtime, ["ETH-USD"]);
  runtime.client.setState("RECONNECTING");
  runtime.client.setState("CONNECTED");
  runtime.client.setState("CONNECTED");
  assert.equal(runtime.subscriptions.activeSubscriptionCount, 1);
  assert.deepEqual(
    runtime.client.payloads.map(({ action, symbols }) => [action, symbols]),
    [
      ["subscribe", ["BTC-USD", "ETH-USD"]],
      ["unsubscribe", ["BTC-USD", "ETH-USD"]],
      ["subscribe", ["ETH-USD"]],
      ["subscribe", ["ETH-USD"]],
    ],
  );
  current();
  runtime.subscriptions.destroy();
  assert.equal(runtime.eventRouter.listeners.size, 0);
  assert.equal(runtime.client.listeners.size, 0);
});

test("a rejected subscription releases the store bindings it acquired", () => {
  const runtime = harness();
  runtime.subscriptions.destroy();
  assert.throws(() => subscribeToWatchlistTickers(runtime, ["BTC-USD"]), /destroyed/);
  assert.equal(runtime.eventRouter.listeners.size, 0);
  assert.equal(runtime.client.listeners.size, 0);
});
