import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { realtimeEventSchema } from "@pulse-trade/contracts";
import { MockMarketDataProvider } from "./fixtures/mock-market-provider.mts";
import { startMockRealtimeServer } from "./fixtures/realtime-server.mjs";

const require = createRequire(import.meta.url);
const { mapProviderEvent } = require("../dist/realtime/provider-event.mapper.js");
const WebSocket = require("ws");

async function until(assertion) {
  for (let attempt = 0; ; attempt++) {
    try {
      return assertion();
    } catch (error) {
      if (attempt === 199) throw error;
      await setTimeout(10);
    }
  }
}

function openSocket(url) {
  const socket = new WebSocket(`${url.replace("http:", "ws:")}/realtime`);
  const messages = [];
  const errors = [];
  socket.on("error", (error) => errors.push(error));
  socket.on("message", (data) =>
    messages.push(realtimeEventSchema.parse(JSON.parse(data.toString()))),
  );
  return { socket, messages, errors };
}

async function command(connection, action, symbols, channels) {
  const requestId = randomUUID();
  connection.socket.send(JSON.stringify({ action, symbols, channels, requestId }));
  await until(() =>
    assert.ok(
      connection.messages.some(
        (event) =>
          event.event === "subscription.ack" &&
          event.data.requestId === requestId &&
          event.data.accepted,
      ),
    ),
  );
}

test("mock provider has repeatable isolated sequences, bounded history and idempotent lifecycle", async () => {
  const run = async () => {
    const provider = new MockMarketDataProvider({ now: () => 1_800_000_000_000 });
    const events = [];
    const connections = [];
    const release = provider.onEvent((event) => events.push(event));
    provider.onConnectionState((event) => connections.push(event));
    await provider.connect();
    await provider.connect();
    const request = {
      symbols: ["BTC-USD", "BTC-USD"],
      channels: ["orderbook", "trades", "orderbook"],
    };
    provider.subscribe(request);
    provider.subscribe(request);
    assert.equal(provider.subscriptionStarts("BTC-USD", "orderbook"), 1);
    provider.ticker("BTC-USD", "50100");
    provider.trades("BTC-USD");
    provider.orderBookDelta("BTC-USD", [{ side: "BID", price: "49990", quantity: "0" }]);
    const books = events.filter((event) => event.type.startsWith("orderbook."));
    assert.deepEqual(
      books.map((event) => event.providerSequence),
      [1, 2],
    );
    for (const event of events) realtimeEventSchema.parse(mapProviderEvent(event));
    const history = await provider.getHistoricalCandles({
      symbol: "ETH-USD",
      interval: "5m",
      limit: 3,
    });
    assert.deepEqual(
      history.map((candle) => candle.close),
      ["3000", "3000", "3000"],
    );
    assert.equal(history[1].time - history[0].time, 300);
    await assert.rejects(
      provider.getHistoricalCandles({ symbol: "ETH-USD", interval: "1m", limit: 301 }),
      /Invalid/,
    );
    assert.throws(
      () => provider.subscribe({ symbols: ["INVALID-USD"], channels: ["ticker"] }),
      /Unsupported/,
    );
    provider.disconnect();
    provider.disconnect();
    const count = events.length;
    provider.ticker("BTC-USD");
    assert.equal(events.length, count, "disconnected provider must not emit market data");
    await provider.connect();
    assert.ok(events.slice(count).some((event) => event.type === "orderbook.snapshot"));
    assert.deepEqual(
      connections.map((event) => event.state),
      ["CONNECTED", "DISCONNECTED", "CONNECTED"],
    );
    release();
    await provider.close();
    await provider.close();
    assert.deepEqual(provider.listenerCounts, { events: 0, connections: 0 });
    assert.deepEqual(provider.activeSubscriptions(), []);
    return events;
  };
  assert.deepEqual(await run(), await run(), "fresh providers must replay identical scenarios");
});

test(
  "mock provider drives real REST/WS snapshots, deltas, stale clock and subscription cleanup",
  { timeout: 15_000 },
  async (t) => {
    const server = await startMockRealtimeServer();
    const clients = [];
    t.after(async () => {
      for (const client of clients) client.socket.terminate();
      await server.close();
    });
    const history = await globalThis.fetch(
      `${server.url}/api/v1/markets/ETH-USD/candles?interval=1m&limit=3`,
    );
    assert.equal(history.status, 200);
    assert.deepEqual(
      (await history.json()).data.candles.map((candle) => candle.close),
      ["3000", "3000", "3000"],
    );
    const first = openSocket(server.url);
    clients.push(first);
    await until(() =>
      assert.ok(first.messages.some((event) => event.event === "connection.ready")),
    );
    await command(first, "subscribe", ["BTC-USD"], ["ticker", "orderbook", "trades", "candles"]);
    await until(() =>
      assert.ok(first.messages.some((event) => event.event === "orderbook.snapshot")),
    );
    await until(() => assert.ok(first.messages.some((event) => event.event === "candle.update")));
    await command(first, "subscribe", ["BTC-USD"], ["ticker", "orderbook", "trades", "candles"]);
    assert.equal(server.provider.subscriptionStarts("BTC-USD", "orderbook"), 1);
    assert.equal(
      server.provider.subscriptionStarts("BTC-USD", "trades"),
      1,
      "candles share the upstream trade subscription",
    );
    const second = openSocket(server.url);
    clients.push(second);
    await until(() =>
      assert.ok(second.messages.some((event) => event.event === "connection.ready")),
    );
    await command(second, "subscribe", ["ETH-USD"], ["ticker"]);
    server.provider.orderBookDelta("BTC-USD", [{ side: "BID", price: "49990", quantity: "0" }]);
    await until(() =>
      assert.ok(
        first.messages.some(
          (event) => event.event === "orderbook.update" && event.data.sequence === "2",
        ),
      ),
    );
    server.advanceTime(15_001);
    await until(() => assert.ok(first.messages.some((event) => event.event === "market.stale")));
    assert.equal(server.freshness("BTC-USD").event, "market.stale");
    const beforeRecovery = first.messages.length;
    server.provider.ticker("BTC-USD", "50100");
    await until(() =>
      assert.ok(
        first.messages.slice(beforeRecovery).some((event) => event.event === "market.live"),
      ),
    );
    server.provider.disconnect();
    const beforeReconnect = first.messages.length;
    await server.provider.connect();
    await until(() =>
      assert.ok(
        first.messages.slice(beforeReconnect).some((event) => event.event === "orderbook.snapshot"),
      ),
    );
    assert.ok(
      second.messages.filter((event) => event.symbol).every((event) => event.symbol === "ETH-USD"),
    );
    await command(first, "unsubscribe", ["BTC-USD"], ["ticker", "orderbook", "trades", "candles"]);
    assert.deepEqual(server.provider.activeSubscriptions(), ["ETH-USD:ticker"]);
    first.socket.terminate();
    second.socket.terminate();
    await until(() => assert.equal(server.activeClientCount(), 0));
    assert.deepEqual(server.provider.activeSubscriptions(), []);
    assert.deepEqual(first.errors, []);
    assert.deepEqual(second.errors, []);
    await server.close();
    assert.deepEqual(server.provider.listenerCounts, { events: 0, connections: 0 });
  },
);
