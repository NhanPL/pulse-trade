import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  RealtimeEventRouter,
  parseRealtimeEvent,
} = require("../.next/realtime-test/event-router.js");

class FakeMessageSource {
  listeners = new Set();

  emit(message) {
    for (const listener of this.listeners) listener(message);
  }

  onMessage(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const tickerUpdate = JSON.stringify({
  data: {
    change24hPercent: "1.25",
    high24h: "110",
    low24h: "90",
    marketTs: 1_700_000_000_000,
    price: "100",
    volume24h: "25",
  },
  event: "ticker.update",
  symbol: "BTC-USD",
  ts: 1_700_000_000_000,
  v: 1,
});

test("parses and validates a shared realtime event envelope", () => {
  assert.deepEqual(parseRealtimeEvent(tickerUpdate), JSON.parse(tickerUpdate));
});

test("discards malformed and invalid websocket payloads", () => {
  assert.equal(parseRealtimeEvent("not-json"), undefined);
  assert.equal(parseRealtimeEvent(JSON.stringify({ event: "ticker.update" })), undefined);
  assert.equal(parseRealtimeEvent(tickerUpdate.replace('"v":1', '"v":2')), undefined);
  assert.equal(parseRealtimeEvent({ event: "ticker.update" }), undefined);
});

test("dispatches only validated events and cleans up the message subscription", () => {
  const source = new FakeMessageSource();
  const router = new RealtimeEventRouter(source);
  const received = [];
  router.onEvent((event) => received.push(event));

  source.emit("not-json");
  source.emit(tickerUpdate);
  assert.deepEqual(received, [JSON.parse(tickerUpdate)]);

  router.destroy();
  source.emit(tickerUpdate);
  assert.deepEqual(received, [JSON.parse(tickerUpdate)]);
  assert.equal(source.listeners.size, 0);
});

test("isolates failing event listeners", () => {
  const source = new FakeMessageSource();
  const router = new RealtimeEventRouter(source);
  const received = [];
  router.onEvent(() => {
    throw new Error("store update failed");
  });
  router.onEvent((event) => received.push(event.event));

  source.emit(tickerUpdate);
  assert.deepEqual(received, ["ticker.update"]);
});
