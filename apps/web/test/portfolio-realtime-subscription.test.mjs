import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  subscribeToPortfolioTickers,
} = require("../.next/realtime-test/features/portfolio/hooks/usePortfolioRealtime.js");

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

test("subscribes only to ticker for the unique held symbols and cleans up once", () => {
  const runtime = createRuntime();
  const release = subscribeToPortfolioTickers(runtime, ["ETH-USD", "BTC-USD", "ETH-USD"]);

  assert.deepEqual(runtime.trackedSubscriptions[0]?.request, {
    channels: ["ticker"],
    symbols: ["BTC-USD", "ETH-USD"],
  });
  assert.equal(runtime.client.listeners.size, 1);
  assert.equal(runtime.eventRouter.listeners.size, 4);

  release();
  release();
  assert.equal(runtime.trackedSubscriptions[0]?.released, true);
  assert.equal(runtime.client.listeners.size, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
});

test("an empty portfolio does not connect or install realtime listeners", () => {
  const runtime = createRuntime();
  const release = subscribeToPortfolioTickers(runtime, []);
  assert.equal(runtime.trackedSubscriptions.length, 0);
  assert.equal(runtime.client.listeners.size, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
  release();
});

test("changing the held symbols releases the previous subscription without listener leaks", () => {
  const runtime = createRuntime();
  const releaseBtc = subscribeToPortfolioTickers(runtime, ["BTC-USD"]);
  releaseBtc();
  const releaseEth = subscribeToPortfolioTickers(runtime, ["ETH-USD"]);

  assert.equal(runtime.trackedSubscriptions[0]?.released, true);
  assert.equal(runtime.trackedSubscriptions[1]?.released, false);
  assert.equal(runtime.client.listeners.size, 1);
  assert.equal(runtime.eventRouter.listeners.size, 4);

  releaseEth();
  assert.equal(runtime.trackedSubscriptions[1]?.released, true);
  assert.equal(runtime.client.listeners.size, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
});
