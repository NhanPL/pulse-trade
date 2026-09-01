import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  connectionReadyEventSchema,
  errorEventSchema,
  subscriptionAckEventSchema,
} from "@pulse-trade/contracts";

const require = createRequire(import.meta.url);
const { RealtimeGateway } = require("../dist/realtime/realtime.gateway.js");
const { SubscriptionRegistry } = require("../dist/realtime/subscription-registry.service.js");

const requestId = "123e4567-e89b-42d3-a456-426614174000";

class FakeProvider {
  subscriptions = [];
  unsubscriptions = [];
  subscribeError = undefined;
  unsubscribeError = undefined;

  close() {
    return Promise.resolve();
  }

  connect() {
    return Promise.resolve();
  }

  getHistoricalCandles() {
    return Promise.resolve([]);
  }

  onConnectionState(listener) {
    listener({ state: "DISCONNECTED", ts: Date.now() });
    return () => {};
  }

  onEvent() {
    return () => {};
  }

  subscribe(subscription) {
    if (this.subscribeError) throw this.subscribeError;
    this.subscriptions.push(subscription);
  }

  unsubscribe(subscription) {
    if (this.unsubscribeError) throw this.unsubscribeError;
    this.unsubscriptions.push(subscription);
  }
}

class FakeBroadcaster {
  initialStates = [];

  scheduleInitialState(client, command) {
    this.initialStates.push({ client, command });
  }
}

class FakeClient {
  closeCalls = [];
  messages = [];
  sendError = undefined;

  close(code, reason) {
    this.closeCalls.push({ code, reason });
  }

  send(payload) {
    if (this.sendError) throw this.sendError;
    this.messages.push(JSON.parse(payload));
  }
}

function createHarness() {
  const provider = new FakeProvider();
  const broadcaster = new FakeBroadcaster();
  const registry = new SubscriptionRegistry(provider);
  const gateway = new RealtimeGateway(broadcaster, registry);

  return { broadcaster, gateway, provider, registry };
}

function subscribeCommand(overrides = {}) {
  return {
    action: "subscribe",
    channels: ["ticker"],
    requestId,
    symbols: ["BTC-USD"],
    ...overrides,
  };
}

function unsubscribeCommand(overrides = {}) {
  return {
    action: "unsubscribe",
    channels: ["ticker"],
    requestId,
    symbols: ["BTC-USD"],
    ...overrides,
  };
}

test("initializes and releases a gateway connection", () => {
  const { gateway } = createHarness();
  const client = new FakeClient();

  gateway.handleConnection(client);

  assert.equal(gateway.activeConnectionCount, 1);
  assert.equal(client.messages.length, 1);
  assert.equal(connectionReadyEventSchema.parse(client.messages[0]).event, "connection.ready");

  gateway.handleDisconnect(client);
  assert.equal(gateway.activeConnectionCount, 0);
});

test("closes and unregisters a client when connection initialization fails", () => {
  const { gateway } = createHarness();
  const client = new FakeClient();
  client.sendError = new Error("socket closed");

  gateway.handleConnection(client);

  assert.equal(gateway.activeConnectionCount, 0);
  assert.deepEqual(client.closeCalls, [{ code: 1011, reason: "Connection initialization failed" }]);
});

test("acknowledges subscribe and unsubscribe commands", () => {
  const { broadcaster, gateway, provider, registry } = createHarness();
  const client = new FakeClient();
  gateway.handleConnection(client);
  const subscribe = subscribeCommand({
    channels: ["ticker", "candles"],
    options: { candleInterval: "5m" },
  });

  const subscribeResponse = gateway.handleSubscribe(client, subscribe);

  assert.equal(subscriptionAckEventSchema.parse(subscribeResponse).data.requestId, requestId);
  assert.deepEqual(provider.subscriptions, [
    {
      channels: ["ticker", "candles"],
      options: { candleInterval: "5m" },
      symbols: ["BTC-USD"],
    },
  ]);
  assert.deepEqual(broadcaster.initialStates, [{ client, command: subscribe }]);
  assert.deepEqual(registry.getSubscribers({ channel: "ticker", symbol: "BTC-USD" }), [client]);

  const unsubscribeResponse = gateway.handleUnsubscribe(
    client,
    unsubscribeCommand({ channels: ["ticker", "candles"] }),
  );

  assert.equal(subscriptionAckEventSchema.parse(unsubscribeResponse).data.accepted, true);
  assert.deepEqual(provider.unsubscriptions, [
    { channels: ["ticker"], symbols: ["BTC-USD"] },
    { channels: ["candles"], symbols: ["BTC-USD"] },
  ]);
  assert.deepEqual(registry.getSubscribers({ channel: "ticker", symbol: "BTC-USD" }), []);
});

test("deduplicates shared subscriptions and releases upstream on the final client", () => {
  const { gateway, provider } = createHarness();
  const firstClient = new FakeClient();
  const secondClient = new FakeClient();
  gateway.handleConnection(firstClient);
  gateway.handleConnection(secondClient);
  const command = subscribeCommand();

  gateway.handleSubscribe(firstClient, command);
  gateway.handleSubscribe(firstClient, command);
  gateway.handleSubscribe(secondClient, command);

  assert.equal(provider.subscriptions.length, 1);

  gateway.handleUnsubscribe(firstClient, unsubscribeCommand());
  assert.equal(provider.unsubscriptions.length, 0);

  gateway.handleDisconnect(secondClient);
  assert.deepEqual(provider.unsubscriptions, [{ channels: ["ticker"], symbols: ["BTC-USD"] }]);
  assert.equal(gateway.activeConnectionCount, 1);
});

test("ignores malformed commands and reports unsupported symbols", () => {
  const { broadcaster, gateway, provider } = createHarness();
  const client = new FakeClient();

  assert.equal(
    gateway.handleSubscribe(client, subscribeCommand({ requestId: "not-a-uuid" })),
    undefined,
  );
  assert.equal(
    gateway.handleUnsubscribe(client, unsubscribeCommand({ channels: ["unknown"] })),
    undefined,
  );
  assert.equal(provider.subscriptions.length, 0);
  assert.equal(provider.unsubscriptions.length, 0);
  assert.equal(broadcaster.initialStates.length, 0);

  const unsupportedSubscribe = errorEventSchema.parse(
    gateway.handleSubscribe(client, subscribeCommand({ symbols: ["DOGE-USD"] })),
  );
  assert.equal(unsupportedSubscribe.data.code, "UNSUPPORTED_SYMBOL");
  assert.match(unsupportedSubscribe.data.message, /DOGE-USD/);

  const unsupportedUnsubscribe = errorEventSchema.parse(
    gateway.handleUnsubscribe(client, unsubscribeCommand({ symbols: ["DOGE-USD"] })),
  );
  assert.equal(unsupportedUnsubscribe.data.code, "UNSUPPORTED_SYMBOL");
});

test("returns stable errors when subscription registry operations fail", () => {
  const { gateway, provider } = createHarness();
  const client = new FakeClient();
  provider.subscribeError = new Error("provider subscribe failed");

  const subscribeError = errorEventSchema.parse(
    gateway.handleSubscribe(client, subscribeCommand()),
  );
  assert.equal(subscribeError.data.code, "SUBSCRIPTION_FAILED");
  assert.equal(subscribeError.data.requestId, requestId);

  provider.subscribeError = undefined;
  gateway.handleSubscribe(client, subscribeCommand());
  provider.unsubscribeError = new Error("provider unsubscribe failed");

  const unsubscribeError = errorEventSchema.parse(
    gateway.handleUnsubscribe(client, unsubscribeCommand()),
  );
  assert.equal(unsubscribeError.data.code, "UNSUBSCRIPTION_FAILED");
  assert.equal(unsubscribeError.data.requestId, requestId);
});
