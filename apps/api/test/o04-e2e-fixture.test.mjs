import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import test from "node:test";

import { createO04MarketFixture } from "./e2e/o04-market-fixture.mjs";
import { startO04Server } from "./e2e/o04-server.mjs";

const require = createRequire(import.meta.url);
const { mapProviderEvent } = require("../dist/realtime/provider-event.mapper.js");
const { subscribeCommandSchema, tickerUpdateEventSchema } = require("@pulse-trade/contracts");

test("O04 ticker fixture publishes valid fixed prices, releases listeners and closes its timer", async (t) => {
  const provider = createO04MarketFixture();
  t.after(() => provider.close());
  const tickers = [];
  const connections = [];
  const removeTicker = provider.onEvent((event) => tickers.push(event));
  const removeConnection = provider.onConnectionState((event) => connections.push(event));
  await provider.connect();
  assert.equal(tickers.length, 1);
  const event = tickerUpdateEventSchema.parse(mapProviderEvent(tickers[0]));
  assert.equal(event.symbol, "BTC-USD");
  assert.equal(event.data.price, "50000");
  assert.equal(connections[0].state, "CONNECTED");
  await provider.connect();
  assert.equal(tickers.length, 1, "duplicate connect must not create another timer");
  removeTicker();
  removeConnection();
  await provider.close();
  assert.equal(connections.length, 1);
  await provider.connect();
  assert.equal(tickers.length, 1, "removed listeners must not receive further ticks");
  await provider.close();
});

test("O04 candle fixture supplies bounded ascending history at the same execution price", async () => {
  const provider = createO04MarketFixture();
  for (const [interval, seconds] of [
    ["1m", 60],
    ["5m", 300],
    ["15m", 900],
    ["1h", 3600],
  ]) {
    const candles = await provider.getHistoricalCandles({ interval, limit: 3, symbol: "BTC-USD" });
    assert.equal(candles.length, 3);
    assert.equal(candles[1].time - candles[0].time, seconds);
    assert.equal(candles[2].time - candles[1].time, seconds);
    assert.equal(candles[2].time % seconds, 0);
    for (const candle of candles) {
      assert.equal(candle.open, "50000");
      assert.equal(candle.close, "50000");
    }
  }
  await assert.rejects(
    provider.getHistoricalCandles({ interval: "1m", limit: 1, symbol: "ETH-USD" }),
    /only BTC-USD/,
  );
});

test("O04 refuses production mode before changing environment or starting the API", async () => {
  const keys = ["NODE_ENV", "DATABASE_URL", "JWT_ACCESS_SECRET", "WEB_ORIGIN"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(startO04Server(), /cannot run with NODE_ENV=production/);
    assert.equal(process.env.NODE_ENV, "production");
    for (const key of keys.slice(1)) assert.equal(process.env[key], previous[key]);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test(
  "O04 fixture uses the real AppModule cache, freshness, HTTP and WebSocket gateway",
  { timeout: 10_000 },
  async (t) => {
    const { Test } = require("@nestjs/testing");
    const { WsAdapter } = require("@nestjs/platform-ws");
    const WebSocket = require("ws");
    const { AppModule } = require("../dist/app.module.js");
    const { PrismaService } = require("../dist/database/prisma.service.js");
    const { configureHttpApplication } = require("../dist/config/http-application.js");
    const { MARKET_DATA_PROVIDER } = require("../dist/markets/provider/market-data-provider.js");
    const { parseRealtimeMessage } = require("../dist/realtime/realtime-message-parser.js");
    const {
      MarketExecutionPriceService,
    } = require("../dist/trading/market-execution-price.service.js");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MARKET_DATA_PROVIDER)
      .useValue(createO04MarketFixture())
      // This infrastructure unit test needs no database; the browser scenario never overrides Prisma.
      .overrideProvider(PrismaService)
      .useValue({ client: { order: { findMany: async () => [] } } })
      .compile();
    const app = module.createNestApplication({ logger: false });
    let socket;
    t.after(async () => {
      socket?.terminate();
      await app.close();
    });
    configureHttpApplication(app, { webOrigin: "http://127.0.0.1:3110" });
    app.useWebSocketAdapter(new WsAdapter(app, { messageParser: parseRealtimeMessage }));
    await app.listen(0, "127.0.0.1");
    assert.equal(app.get(MarketExecutionPriceService).getPrice("BTC-USD"), "50000");
    const url = await app.getUrl();
    const history = await globalThis.fetch(
      `${url}/api/v1/markets/BTC-USD/candles?interval=1m&limit=3`,
      {
        headers: { Origin: "http://127.0.0.1:3110" },
      },
    );
    assert.equal(history.status, 200);
    assert.equal(history.headers.get("access-control-allow-origin"), "http://127.0.0.1:3110");
    assert.equal((await history.json()).data.candles.length, 3);

    socket = new WebSocket(`${url.replace("http:", "ws:")}/realtime`);
    await new Promise((resolve, reject) => {
      socket.once("error", reject);
      socket.on("message", (payload) => {
        try {
          const event = JSON.parse(payload.toString());
          if (event.event === "connection.ready") {
            socket.send(
              JSON.stringify(
                subscribeCommandSchema.parse({
                  action: "subscribe",
                  requestId: "123e4567-e89b-42d3-a456-426614174000",
                  symbols: ["BTC-USD"],
                  channels: ["ticker"],
                }),
              ),
            );
          }
          if (event.event === "ticker.update") {
            assert.equal(tickerUpdateEventSchema.parse(event).data.price, "50000");
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  },
);
