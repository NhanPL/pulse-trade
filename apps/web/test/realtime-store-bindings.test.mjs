import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  acquireRealtimeStoreBindings,
} = require("../.next/realtime-test/features/realtime/realtime-store-bindings.js");

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

test("shares store bindings for a runtime until the final consumer releases them", () => {
  const runtime = {
    client: new FakeRealtimeClient(),
    eventRouter: new FakeEventRouter(),
  };
  const releaseFirst = acquireRealtimeStoreBindings(runtime);
  const releaseSecond = acquireRealtimeStoreBindings(runtime);

  assert.equal(runtime.client.listeners.size, 1);
  assert.equal(runtime.eventRouter.listeners.size, 3);

  releaseFirst();
  assert.equal(runtime.client.listeners.size, 1);
  assert.equal(runtime.eventRouter.listeners.size, 3);

  releaseSecond();
  assert.equal(runtime.client.listeners.size, 0);
  assert.equal(runtime.eventRouter.listeners.size, 0);
});
