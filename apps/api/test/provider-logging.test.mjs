import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { EventEmitter, once } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { CoinbaseProvider } = require("../dist/markets/provider/coinbase-provider.js");
const { BackendLogger } = require("../dist/observability/backend-logger.js");
const { RealtimeGateway } = require("../dist/realtime/realtime.gateway.js");
const { SubscriptionRegistry } = require("../dist/realtime/subscription-registry.service.js");

class FakeSocket extends EventEmitter {
  readyState = 0;
  commands = [];
  send(command) {
    this.commands.push(JSON.parse(command));
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
  close(code = 1000) {
    this.readyState = 3;
    this.emit("close", code, "PRIVATE_CLOSE_REASON");
  }
  terminate() {
    this.close(1006);
  }
}

test("provider lifecycle emits structured states/retry metadata without endpoint, payload or close reason", async (t) => {
  const records = [];
  const sockets = [];
  const connections = new EventEmitter();
  const provider = new CoinbaseProvider({
    endpoint: "wss://PRIVATE_ENDPOINT/?token=PRIVATE_TOKEN",
    reconnectDelaysMs: [0],
    reconnectJitterRatio: 0,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      connections.emit("socket", socket);
      return socket;
    },
  });
  provider.logger = new BackendLogger("CoinbaseProvider", {
    write: (line) => records.push(JSON.parse(line)),
  });
  t.after(() => provider.close());
  provider.subscribe({ channels: ["ticker"], symbols: ["BTC-USD"] });
  const states = [];
  const removeState = provider.onConnectionState(({ state }) => states.push(state));
  t.after(removeState);
  const attempt = provider.connect();
  sockets[0].open();
  await attempt;
  sockets[0].emit("message", Buffer.from("PRIVATE_INVALID_PAYLOAD"));
  sockets[0].emit(
    "message",
    Buffer.from(JSON.stringify({ channel: "ticker", events: [{ secret: "PRIVATE_PAYLOAD" }] })),
  );

  const nextSocket = once(connections, "socket");
  sockets[0].close(1012);
  const [reconnected] = await nextSocket;
  const recovered = once(reconnected, "open");
  reconnected.open();
  await recovered;
  assert.equal(reconnected.commands.filter(({ channel }) => channel === "ticker").length, 1);
  assert.equal(sockets[0].listenerCount("message"), 0);
  assert.deepEqual(states, ["DISCONNECTED", "CONNECTED", "DISCONNECTED", "CONNECTED"]);
  assert.deepEqual(
    records
      .filter(({ event }) => event === "provider.state_changed")
      .map(({ providerState }) => providerState),
    ["CONNECTED", "DISCONNECTED", "CONNECTED"],
  );
  const retry = records.find(({ event }) => event === "provider.reconnect_scheduled");
  assert.equal(retry.attempt, 1);
  assert.equal(retry.delayMs, 0);
  assert.equal(records.filter(({ event }) => event === "provider.invalid_message").length, 1);
  await provider.close();
  assert.equal(provider.reconnectTimer, undefined);
  assert.equal(provider.stableConnectionTimer, undefined);
  assert.equal(records.at(-1).event, "provider.socket_closed");
  assert.equal(JSON.stringify(records).includes("PRIVATE"), false);
});

test("provider listener failures are isolated and never serialize thrown objects or market data", async () => {
  const records = [];
  const provider = new CoinbaseProvider();
  provider.logger = new BackendLogger("CoinbaseProvider", {
    write: (line) => records.push(JSON.parse(line)),
  });
  const removeFailure = provider.onEvent(() => {
    throw new Error("PRIVATE_LISTENER_PASSWORD");
  });
  let delivered = 0;
  const removeConsumer = provider.onEvent(() => {
    delivered++;
  });
  const removeState = provider.onConnectionState(() => {
    throw { token: "PRIVATE_TOKEN" };
  });
  const event = {
    type: "ticker",
    symbol: "BTC-USD",
    price: "PRIVATE_PRICE",
    quantity: "PRIVATE_QUANTITY",
  };
  provider.emitEvent(event);
  provider.emitEvent(event);
  assert.equal(delivered, 2);
  assert.equal(records.filter(({ event }) => event === "provider.listener_failed").length, 1);
  assert.equal(records.find(({ event }) => event === "provider.listener_failed").symbol, "BTC-USD");
  assert.equal(JSON.stringify(records).includes("PRIVATE"), false);
  removeFailure();
  removeConsumer();
  removeState();
  assert.equal(provider.eventListeners.size, 0);
  assert.equal(provider.stateListeners.size, 0);
  await provider.close();
});

test("client lifecycle correlates with the public connection ID and does not retain closed sockets", () => {
  const records = [];
  const registry = new SubscriptionRegistry({});
  const gateway = new RealtimeGateway({}, registry);
  gateway.logger = new BackendLogger("RealtimeGateway", {
    write: (line) => records.push(JSON.parse(line)),
  });
  const client = new FakeSocket();
  client.readyState = 1;
  gateway.handleConnection(client);
  const connectionId = client.commands[0].data.connectionId;
  gateway.handleDisconnect(client);
  gateway.handleDisconnect(client);
  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map(({ connectionId: id }) => id),
    [connectionId, connectionId],
  );
  assert.deepEqual(
    records.map(({ activeConnections }) => activeConnections),
    [1, 0],
  );
  assert.equal(gateway.connectionIds.has(client), false);
  assert.equal(registry.activeClientCount, 0);
});
