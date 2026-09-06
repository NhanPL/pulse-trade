import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { RealtimeSubscriptionManager } = require("../.next/realtime-test/subscription-manager.js");

class FakeRealtimeClient {
  connectCalls = 0;
  listeners = new Set();
  payloads = [];
  state = "DISCONNECTED";

  connect() {
    this.connectCalls += 1;
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

function createHarness(state = "CONNECTED") {
  const client = new FakeRealtimeClient();
  client.state = state;
  let requestId = 0;
  const manager = new RealtimeSubscriptionManager(client, {
    createRequestId: () => `00000000-0000-4000-8000-${String(++requestId).padStart(12, "0")}`,
  });

  return { client, manager };
}

test("sends canonical subscribe and unsubscribe commands", () => {
  const { client, manager } = createHarness();
  const cleanup = manager.subscribe({
    channels: ["trades", "ticker", "ticker"],
    options: { candleInterval: undefined },
    symbols: ["ETH-USD", "BTC-USD", "BTC-USD"],
  });

  assert.equal(client.connectCalls, 1);
  assert.deepEqual(client.payloads, [
    {
      action: "subscribe",
      channels: ["ticker", "trades"],
      requestId: "00000000-0000-4000-8000-000000000001",
      symbols: ["BTC-USD", "ETH-USD"],
    },
  ]);

  cleanup();
  assert.deepEqual(client.payloads.at(-1), {
    action: "unsubscribe",
    channels: ["ticker", "trades"],
    requestId: "00000000-0000-4000-8000-000000000002",
    symbols: ["BTC-USD", "ETH-USD"],
  });
  assert.equal(manager.activeSubscriptionCount, 0);
});

test("deduplicates identical subscriptions until the final cleanup", () => {
  const { client, manager } = createHarness();
  const firstCleanup = manager.subscribe({
    channels: ["ticker", "trades"],
    symbols: ["BTC-USD", "ETH-USD"],
  });
  const secondCleanup = manager.subscribe({
    channels: ["trades", "ticker"],
    symbols: ["ETH-USD", "BTC-USD"],
  });

  assert.equal(client.payloads.length, 1);
  assert.equal(manager.activeSubscriptionCount, 1);

  firstCleanup();
  assert.equal(client.payloads.length, 1);
  secondCleanup();
  assert.equal(client.payloads.length, 2);
  secondCleanup();
  assert.equal(client.payloads.length, 2);
});

test("resubscribes active entries once after reconnect and sends subscriptions created meanwhile", () => {
  const { client, manager } = createHarness("DISCONNECTED");
  const btcCleanup = manager.subscribe({ channels: ["ticker"], symbols: ["BTC-USD"] });
  assert.equal(client.payloads.length, 0);

  client.setState("CONNECTING");
  client.setState("CONNECTED");
  assert.equal(client.payloads.length, 1);

  client.setState("RECONNECTING");
  const ethCleanup = manager.subscribe({ channels: ["ticker"], symbols: ["ETH-USD"] });
  client.setState("CONNECTED");

  assert.equal(client.payloads.length, 3);
  assert.deepEqual(
    client.payloads.map(({ symbols }) => symbols),
    [["BTC-USD"], ["BTC-USD"], ["ETH-USD"]],
  );

  client.setState("CONNECTED");
  assert.equal(client.payloads.length, 3);

  btcCleanup();
  ethCleanup();
});

test("does not resubscribe entries released while reconnecting", () => {
  const { client, manager } = createHarness();
  const btcCleanup = manager.subscribe({ channels: ["ticker"], symbols: ["BTC-USD"] });
  const ethCleanup = manager.subscribe({ channels: ["ticker"], symbols: ["ETH-USD"] });

  client.setState("RECONNECTING");
  ethCleanup();
  client.setState("CONNECTED");

  assert.deepEqual(
    client.payloads.filter(({ action }) => action === "subscribe").map(({ symbols }) => symbols),
    [["BTC-USD"], ["ETH-USD"], ["BTC-USD"]],
  );

  btcCleanup();
});

test("resubscribes active entries after an explicit disconnected lifecycle", () => {
  const { client, manager } = createHarness();
  const cleanup = manager.subscribe({ channels: ["ticker"], symbols: ["BTC-USD"] });

  client.setState("DISCONNECTED");
  client.setState("CONNECTING");
  client.setState("CONNECTED");

  assert.equal(client.payloads.filter(({ action }) => action === "subscribe").length, 2);

  cleanup();
});

test("releases all owned subscriptions and the connection listener on destroy", () => {
  const { client, manager } = createHarness();
  manager.subscribe({
    channels: ["candles"],
    options: { candleInterval: "1m" },
    symbols: ["BTC-USD"],
  });
  assert.equal(client.listeners.size, 1);

  manager.destroy();

  assert.equal(manager.activeSubscriptionCount, 0);
  assert.equal(client.listeners.size, 0);
  assert.equal(client.payloads.at(-1).action, "unsubscribe");
  assert.throws(
    () => manager.subscribe({ channels: ["ticker"], symbols: ["ETH-USD"] }),
    /destroyed/,
  );
});

test("rejects invalid subscription shapes before emitting any command", () => {
  const { client, manager } = createHarness();

  assert.throws(() => manager.subscribe({ channels: [], symbols: ["BTC-USD"] }), /channel/);
  assert.throws(() => manager.subscribe({ channels: ["ticker"], symbols: [] }), /symbol/);
  assert.throws(
    () =>
      manager.subscribe({
        channels: ["ticker"],
        options: { candleInterval: "1m" },
        symbols: ["BTC-USD"],
      }),
    /candle interval/,
  );
  assert.equal(client.payloads.length, 0);
});
