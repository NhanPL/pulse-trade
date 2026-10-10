import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import { clearTimeout, setTimeout } from "node:timers";

import { MockMarketDataProvider } from "./fixtures/mock-market-provider.mts";

const require = createRequire(import.meta.url);
const { Test } = require("@nestjs/testing");
const { WsAdapter } = require("@nestjs/platform-ws");
const WebSocket = require("ws");
const { realtimeEventSchema } = require("@pulse-trade/contracts");
const { HealthModule } = require("../dist/health/health.module.js");
const { RealtimeModule } = require("../dist/realtime/realtime.module.js");
const { MARKET_DATA_PROVIDER } = require("../dist/markets/provider/market-data-provider.js");
const { SubscriptionRegistry } = require("../dist/realtime/subscription-registry.service.js");
const { loadEnvironment } = require("../dist/config/configuration.js");
const { configureHttpApplication } = require("../dist/config/http-application.js");
const { parseRealtimeMessage } = require("../dist/realtime/realtime-message-parser.js");

function receive(socket, predicate) {
  // Attach before sending a command so an immediate acknowledgement/snapshot cannot be missed.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Realtime event timed out")), 5_000);
    function finish(error, event) {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
      socket.off("close", onClose);
      if (error) reject(error);
      else resolve(event);
    }
    function onMessage(payload) {
      try {
        const event = realtimeEventSchema.parse(JSON.parse(payload.toString()));
        if (predicate(event)) finish(undefined, event);
      } catch (error) {
        finish(error);
      }
    }
    function onError(error) {
      finish(error);
    }
    function onClose() {
      finish(new Error("Socket closed before the expected event"));
    }
    socket.on("message", onMessage);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

async function startServer(t) {
  const provider = new MockMarketDataProvider();
  const module = await Test.createTestingModule({ imports: [HealthModule, RealtimeModule] })
    .overrideProvider(MARKET_DATA_PROVIDER)
    .useValue(provider)
    .compile();
  const app = module.createNestApplication({ logger: false });
  t.after(() => app.close());
  app.enableShutdownHooks();
  const environment = loadEnvironment({
    NODE_ENV: "production",
    PORT: "10000",
    WEB_ORIGIN: "https://web.example.test",
  });
  assert.equal(environment.port, 10_000);
  configureHttpApplication(app, environment);
  app.useWebSocketAdapter(new WsAdapter(app, { messageParser: parseRealtimeMessage }));
  // An ephemeral port avoids clashes; the interface matches the Render entrypoint.
  await app.listen(0, "0.0.0.0");
  const port = app.getHttpServer().address().port;
  return {
    app,
    provider,
    registry: module.get(SubscriptionRegistry),
    base: `http://127.0.0.1:${port}`,
    ws: `ws://127.0.0.1:${port}/realtime`,
  };
}

test("deployment boundary serves HTTP and all realtime channels on one port and accepts re-subscription", async (t) => {
  const server = await startServer(t);
  const response = await globalThis.fetch(`${server.base}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { status: "ok" } });

  const connectionIds = new Set();
  for (let connection = 0; connection < 2; connection++) {
    const socket = new WebSocket(server.ws);
    t.after(() => socket.terminate());
    const ready = await receive(socket, (event) => event.event === "connection.ready");
    connectionIds.add(ready.data.connectionId);
    const command = {
      action: "subscribe",
      channels: ["ticker", "orderbook", "trades", "candles"],
      symbols: ["BTC-USD"],
      options: { candleInterval: "1m" },
      requestId: randomUUID(),
    };
    const events = ["ticker.update", "orderbook.snapshot", "trades.batch", "candle.update"];
    const received = Promise.all([
      receive(
        socket,
        (event) => event.event === "subscription.ack" && event.data.requestId === command.requestId,
      ),
      ...events.map((name) =>
        receive(socket, (event) => event.event === name && event.symbol === "BTC-USD"),
      ),
    ]);
    socket.send(JSON.stringify(command));
    const [ack, ticker, book, trades, candles] = await received;
    assert.equal(ack.data.accepted, true);
    assert.equal(ticker.data.price, "50000");
    assert.ok(book.data.bids.length > 0 && book.data.asks.length > 0);
    assert.ok(trades.data.trades.length > 0);
    assert.equal(candles.data.interval, "1m");
    assert.equal(candles.data.candle.close, "50000");

    const [backendSocket] = server.registry.getSubscribers({
      channel: "ticker",
      symbol: "BTC-USD",
    });
    const disconnected = once(backendSocket, "close", {
      signal: globalThis.AbortSignal.timeout(5_000),
    });

    const unsubscribe = {
      action: "unsubscribe",
      channels: command.channels,
      symbols: command.symbols,
      requestId: randomUUID(),
    };
    const unsubscription = receive(
      socket,
      (event) =>
        event.event === "subscription.ack" && event.data.requestId === unsubscribe.requestId,
    );
    socket.send(JSON.stringify(unsubscribe));
    assert.equal((await unsubscription).data.accepted, true);
    assert.deepEqual(server.provider.activeSubscriptions(), []);
    const closed = once(socket, "close", { signal: globalThis.AbortSignal.timeout(5_000) });
    socket.close(1000);
    await Promise.all([closed, disconnected]);
    assert.equal(server.registry.activeClientCount, 0);
  }
  assert.equal(connectionIds.size, 2);
});

test("Nest shutdown closes an active upgraded socket and releases provider listeners without forced fixture cleanup", async (t) => {
  const server = await startServer(t);
  const socket = new WebSocket(server.ws);
  t.after(() => socket.terminate());
  await receive(socket, (event) => event.event === "connection.ready");
  const command = {
    action: "subscribe",
    channels: ["ticker"],
    symbols: ["BTC-USD"],
    requestId: randomUUID(),
  };
  const ack = receive(socket, (event) => event.event === "subscription.ack");
  socket.send(JSON.stringify(command));
  await ack;
  assert.equal(server.registry.activeClientCount, 1);
  const closed = once(socket, "close", { signal: globalThis.AbortSignal.timeout(5_000) });
  // No socket.destroy()/terminate() before app.close(): exercise the real adapter shutdown.
  await Promise.all([server.app.close(), closed]);
  assert.equal(socket.readyState, WebSocket.CLOSED);
  assert.equal(server.registry.activeClientCount, 0);
  assert.deepEqual(server.provider.activeSubscriptions(), []);
  assert.deepEqual(server.provider.listenerCounts, { events: 0, connections: 0 });
});

test("deployment build retains the native password module and Prisma runtime artifacts", async () => {
  const argon2 = require("argon2");
  const password = "P08 disposable native module check";
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  assert.equal(await argon2.verify(hash, password), true);
  const { PrismaClient } = require("../dist/generated/prisma/client.js");
  assert.equal(typeof PrismaClient, "function");
});
