import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  RealtimeClient,
  calculateReconnectDelayMs,
} = require("../.next/realtime-test/RealtimeClient.js");

class FakeScheduler {
  nextId = 1;
  tasks = new Map();

  clearTimeout = (id) => {
    this.tasks.delete(id);
  };

  setTimeout = (callback, delay) => {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { callback, delay });
    return id;
  };

  get delays() {
    return [...this.tasks.values()].map(({ delay }) => delay);
  }

  runNext() {
    const entry = this.tasks.entries().next().value;
    assert.ok(entry, "expected a scheduled timer");
    const [id, task] = entry;
    this.tasks.delete(id);
    task.callback();
  }
}

class FakeSocket {
  closeCalls = [];
  listeners = new Map();
  readyState = 0;

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(code, reason) {
    this.closeCalls.push({ code, reason });
    this.readyState = 2;
  }

  emit(type) {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;

    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

function createHarness(options = {}) {
  const scheduler = new FakeScheduler();
  const sockets = [];
  const urls = [];
  const client = new RealtimeClient(
    "ws://localhost:3001/realtime",
    (url) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      urls.push(url);
      return socket;
    },
    {
      clearTimeout: scheduler.clearTimeout,
      random: () => 0.5,
      reconnectDelaysMs: [1_000, 2_000, 4_000, 8_000, 15_000, 30_000],
      reconnectJitterRatio: 0,
      setTimeout: scheduler.setTimeout,
      stableConnectionMs: 30_000,
      ...options,
    },
  );

  return { client, scheduler, sockets, urls };
}

test("reports the connection lifecycle and cleans up its socket listeners", () => {
  const { client, scheduler, sockets, urls } = createHarness();
  const states = [];
  const removeStateListener = client.onConnectionState((state) => states.push(state));

  client.connect();
  assert.deepEqual(urls, ["ws://localhost:3001/realtime"]);
  assert.equal(sockets[0].listenerCount(), 3);

  sockets[0].emit("open");
  sockets[0].emit("close");

  assert.deepEqual(states, ["DISCONNECTED", "CONNECTING", "CONNECTED", "RECONNECTING"]);
  assert.equal(client.connectionState, "RECONNECTING");
  assert.equal(sockets[0].listenerCount(), 0);
  assert.deepEqual(scheduler.delays, [1_000]);

  removeStateListener();
  client.disconnect();
  assert.deepEqual(states, ["DISCONNECTED", "CONNECTING", "CONNECTED", "RECONNECTING"]);
});

test("keeps connect idempotent while a socket is connecting, open, or reconnecting", () => {
  const { client, scheduler, sockets } = createHarness();

  client.connect();
  client.connect();
  assert.equal(sockets.length, 1);

  sockets[0].emit("open");
  client.connect();
  assert.equal(sockets.length, 1);

  sockets[0].emit("close");
  client.connect();
  assert.equal(sockets.length, 1);
  scheduler.runNext();
  assert.equal(sockets.length, 2);
});

test("disconnect closes the active socket once and cancels lifecycle timers", () => {
  const { client, scheduler, sockets } = createHarness();
  const states = [];
  client.onConnectionState((state) => states.push(state));
  client.connect();
  sockets[0].emit("open");

  client.disconnect();
  client.disconnect();

  assert.deepEqual(sockets[0].closeCalls, [{ code: 1000, reason: "Client disconnect" }]);
  assert.equal(sockets[0].listenerCount(), 0);
  assert.deepEqual(scheduler.delays, []);
  assert.equal(client.connectionState, "DISCONNECTED");
  assert.deepEqual(states, ["DISCONNECTED", "CONNECTING", "CONNECTED", "DISCONNECTED"]);
});

test("reconnects after socket errors without retaining stale listeners", () => {
  const { client, scheduler, sockets } = createHarness();
  client.connect();

  sockets[0].emit("error");

  assert.equal(client.connectionState, "RECONNECTING");
  assert.deepEqual(sockets[0].closeCalls, [{ code: undefined, reason: undefined }]);
  assert.equal(sockets[0].listenerCount(), 0);

  client.connect();
  assert.equal(sockets.length, 1);
  scheduler.runNext();
  assert.equal(sockets.length, 2);
  sockets[0].emit("open");
  assert.equal(client.connectionState, "RECONNECTING");
});

test("uses bounded exponential delays and resets after a stable connection", () => {
  const { client, scheduler, sockets } = createHarness({
    reconnectDelaysMs: [100, 200, 400],
    stableConnectionMs: 1_000,
  });
  client.connect();
  sockets[0].emit("open");

  sockets[0].emit("close");
  assert.deepEqual(scheduler.delays, [100]);
  scheduler.runNext();
  sockets[1].emit("open");
  sockets[1].emit("close");
  assert.deepEqual(scheduler.delays, [200]);
  scheduler.runNext();
  sockets[2].emit("open");
  sockets[2].emit("close");
  assert.deepEqual(scheduler.delays, [400]);
  scheduler.runNext();
  sockets[3].emit("open");

  assert.deepEqual(scheduler.delays, [1_000]);
  scheduler.runNext();
  sockets[3].emit("close");
  assert.deepEqual(scheduler.delays, [100]);
});

test("applies jitter while keeping reconnect delays bounded", () => {
  assert.equal(calculateReconnectDelayMs(0, [1_000, 2_000], 0.2, 0), 800);
  assert.equal(calculateReconnectDelayMs(0, [1_000, 2_000], 0.2, 1), 1_200);
  assert.equal(calculateReconnectDelayMs(99, [1_000, 2_000], 0.2, 1), 2_000);
  assert.equal(calculateReconnectDelayMs(-1, [1_000, 2_000], 0.2, 0.5), 1_000);
  assert.throws(() => calculateReconnectDelayMs(0, [], 0.2, 0.5), /delays/);
  assert.throws(() => calculateReconnectDelayMs(0, [1_000], 2, 0.5), /jitter ratio/);
});

test("returns to disconnected when socket construction fails", () => {
  const error = new Error("WebSocket unavailable");
  const client = new RealtimeClient("ws://localhost:3001/realtime", () => {
    throw error;
  });
  const states = [];
  client.onConnectionState((state) => states.push(state));

  assert.throws(() => client.connect(), error);
  assert.equal(client.connectionState, "DISCONNECTED");
  assert.deepEqual(states, ["DISCONNECTED", "CONNECTING", "DISCONNECTED"]);
});

test("isolates failing connection-state listeners", () => {
  const { client, sockets } = createHarness();
  const states = [];
  client.onConnectionState(() => {
    throw new Error("consumer failed");
  });
  client.onConnectionState((state) => states.push(state));

  client.connect();
  sockets[0].emit("open");

  assert.deepEqual(states, ["DISCONNECTED", "CONNECTING", "CONNECTED"]);
});
