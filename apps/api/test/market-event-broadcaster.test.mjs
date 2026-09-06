import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { setImmediate as waitForImmediate } from "node:timers";

const require = createRequire(import.meta.url);
const { CandleAggregationService } = require("../dist/realtime/candle-aggregation.service.js");
const { MarketEventBroadcaster } = require("../dist/realtime/market-event-broadcaster.service.js");
const { SubscriptionRegistry } = require("../dist/realtime/subscription-registry.service.js");

class FakeProvider {
  subscribe() {}
  unsubscribe() {}
}

class FakeClient {
  messages = [];
  readyState = 1;

  send(payload) {
    this.messages.push(JSON.parse(payload));
  }
}

function candleSubscription(interval) {
  return {
    action: "subscribe",
    channels: ["candles"],
    options: { candleInterval: interval },
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    symbols: ["BTC-USD"],
  };
}

test("routes derived candle updates only to subscribers of the matching interval", () => {
  const provider = new FakeProvider();
  const cache = {
    applied: [],
    apply(event) {
      this.applied.push(event);
    },
  };
  const freshness = {
    recordMarketEvent() {
      return undefined;
    },
  };
  const registry = new SubscriptionRegistry(provider);
  const broadcaster = new MarketEventBroadcaster(
    provider,
    cache,
    new CandleAggregationService(),
    freshness,
    registry,
  );
  const oneMinuteClient = new FakeClient();
  const fiveMinuteClient = new FakeClient();

  registry.registerClient(oneMinuteClient);
  registry.registerClient(fiveMinuteClient);
  registry.subscribe(oneMinuteClient, candleSubscription("1m"));
  registry.subscribe(fiveMinuteClient, candleSubscription("5m"));

  broadcaster.handleProviderEvent({
    marketTs: 1_700_002_810_000,
    providerSequence: 1,
    symbol: "BTC-USD",
    trades: [
      {
        id: "trade-1",
        marketTs: 1_700_002_810_000,
        price: "100",
        quantity: "1",
        side: "BUY",
      },
    ],
    type: "trades.batch",
  });

  assert.deepEqual(
    oneMinuteClient.messages.map((message) => message.data.interval),
    ["1m"],
  );
  assert.deepEqual(
    fiveMinuteClient.messages.map((message) => message.data.interval),
    ["5m"],
  );
  assert.deepEqual(
    cache.applied.map((event) => event.interval),
    ["1m", "5m", "15m", "1h"],
  );
});

test("bootstraps the active candle before sending initial state to a new subscriber", async () => {
  const historicalRequests = [];
  const provider = new FakeProvider();
  provider.getHistoricalCandles = async (request) => {
    historicalRequests.push(request);
    return [
      {
        close: "101",
        high: "102",
        low: "99",
        open: "100",
        time: 1_700_002_800,
        volume: "10",
      },
    ];
  };
  const cache = {
    applied: [],
    apply(event) {
      this.applied.push(event);
    },
    getCandle(symbol, interval) {
      return this.applied.findLast(
        (event) => event.symbol === symbol && event.interval === interval,
      );
    },
  };
  const freshness = {
    getCurrentEvent() {
      return undefined;
    },
    recordMarketEvent() {
      return undefined;
    },
  };
  const registry = new SubscriptionRegistry(provider);
  const broadcaster = new MarketEventBroadcaster(
    provider,
    cache,
    new CandleAggregationService(),
    freshness,
    registry,
  );
  const client = new FakeClient();

  registry.registerClient(client);
  const command = candleSubscription("15m");
  registry.subscribe(client, command);
  broadcaster.scheduleInitialState(client, command);
  await new Promise((resolve) => waitForImmediate(resolve));

  assert.deepEqual(historicalRequests, [{ interval: "15m", limit: 1, symbol: "BTC-USD" }]);
  assert.deepEqual(
    client.messages.map((message) => message.data.interval),
    ["15m"],
  );
});
