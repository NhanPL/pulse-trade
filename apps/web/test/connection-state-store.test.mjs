import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  bindConnectionStateStore,
  connectionStateStore,
  selectConnectionState,
} = require("../.next/realtime-test/features/realtime/stores/connection-state-store.js");

class FakeConnectionStateSource {
  listeners = new Set();
  state;

  constructor(state = "DISCONNECTED") {
    this.state = state;
  }

  get connectionState() {
    return this.state;
  }

  onConnectionState(listener) {
    this.listeners.add(listener);
    listener(this.state);

    return () => this.listeners.delete(listener);
  }

  setConnectionState(state) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function resetStore() {
  connectionStateStore.getState().setConnectionState("DISCONNECTED");
}

test("starts disconnected and avoids notifying subscribers for duplicate state updates", () => {
  resetStore();
  const observedStates = [];
  const unsubscribe = connectionStateStore.subscribe((state) => {
    observedStates.push(selectConnectionState(state));
  });

  connectionStateStore.getState().setConnectionState("DISCONNECTED");
  connectionStateStore.getState().setConnectionState("CONNECTING");
  connectionStateStore.getState().setConnectionState("CONNECTING");

  unsubscribe();
  assert.deepEqual(observedStates, ["CONNECTING"]);
  resetStore();
});

test("synchronizes RealtimeClient lifecycle state and cleans up its listener", () => {
  resetStore();
  const source = new FakeConnectionStateSource("CONNECTING");
  const unbind = bindConnectionStateStore(source);

  assert.equal(connectionStateStore.getState().connectionState, "CONNECTING");
  assert.equal(source.listeners.size, 1);

  source.setConnectionState("CONNECTED");
  assert.equal(connectionStateStore.getState().connectionState, "CONNECTED");

  unbind();
  source.setConnectionState("RECONNECTING");
  assert.equal(connectionStateStore.getState().connectionState, "CONNECTED");
  assert.equal(source.listeners.size, 0);
  resetStore();
});
