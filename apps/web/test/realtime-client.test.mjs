import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { RealtimeClient } = require("../.next/realtime-test/RealtimeClient.js");

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

function createHarness() {
  const sockets = [];
  const urls = [];
  const client = new RealtimeClient("ws://localhost:3001/realtime", (url) => {
    const socket = new FakeSocket();
    sockets.push(socket);
    urls.push(url);
    return socket;
  });

  return { client, sockets, urls };
}

test("reports the connection lifecycle and cleans up its socket listeners", () => {
  const { client, sockets, urls } = createHarness();
  const states = [];
  const removeStateListener = client.onConnectionState((state) => states.push(state));

  client.connect();
  assert.deepEqual(urls, ["ws://localhost:3001/realtime"]);
  assert.equal(sockets[0].listenerCount(), 3);

  sockets[0].emit("open");
  sockets[0].emit("close");

  assert.deepEqual(states, ["DISCONNECTED", "CONNECTING", "CONNECTED", "DISCONNECTED"]);
  assert.equal(client.connectionState, "DISCONNECTED");
  assert.equal(sockets[0].listenerCount(), 0);

  removeStateListener();
  client.connect();
  assert.deepEqual(states, ["DISCONNECTED", "CONNECTING", "CONNECTED", "DISCONNECTED"]);
});

test("keeps connect idempotent while a socket is connecting or open", () => {
  const { client, sockets } = createHarness();

  client.connect();
  client.connect();
  assert.equal(sockets.length, 1);

  sockets[0].emit("open");
  client.connect();
  assert.equal(sockets.length, 1);
});

test("disconnect closes the active socket once and releases all listeners", () => {
  const { client, sockets } = createHarness();
  const states = [];
  client.onConnectionState((state) => states.push(state));
  client.connect();
  sockets[0].emit("open");

  client.disconnect();
  client.disconnect();

  assert.deepEqual(sockets[0].closeCalls, [{ code: 1000, reason: "Client disconnect" }]);
  assert.equal(sockets[0].listenerCount(), 0);
  assert.equal(client.connectionState, "DISCONNECTED");
  assert.deepEqual(states, ["DISCONNECTED", "CONNECTING", "CONNECTED", "DISCONNECTED"]);
});

test("treats socket errors as terminal without retaining stale listeners", () => {
  const { client, sockets } = createHarness();
  client.connect();

  sockets[0].emit("error");

  assert.equal(client.connectionState, "DISCONNECTED");
  assert.deepEqual(sockets[0].closeCalls, [{ code: undefined, reason: undefined }]);
  assert.equal(sockets[0].listenerCount(), 0);

  client.connect();
  assert.equal(sockets.length, 2);
  sockets[0].emit("open");
  assert.equal(client.connectionState, "CONNECTING");
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
