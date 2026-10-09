import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  MarketCacheService,
  MAX_CACHED_TRADES_PER_SYMBOL,
} = require("../dist/realtime/market-cache.service.js");
const { CandleAggregationService } = require("../dist/realtime/candle-aggregation.service.js");
const { mapProviderEvent } = require("../dist/realtime/provider-event.mapper.js");
const { SUPPORTED_MARKET_SYMBOLS } = require("../dist/markets/supported-markets.js");

const startTs = 1_700_002_800_000;

function trade(index, symbol = "BTC-USD") {
  return {
    id: `${symbol}-${String(index).padStart(6, "0")}`,
    marketTs: startTs + index,
    price: "50000.00000001",
    quantity: "1",
    side: "BUY",
  };
}

function event(trades, providerSequence = 1, symbol = "BTC-USD") {
  return {
    type: "trades.batch",
    symbol,
    marketTs: Math.max(startTs, ...trades.map((item) => item.marketTs)),
    providerSequence,
    trades,
  };
}

test("P03 backend cache and candle dedupe remain bounded after 100,000 trades", (t) => {
  assert.equal(MAX_CACHED_TRADES_PER_SYMBOL, 50);
  const cache = new MarketCacheService({});
  const candles = new CandleAggregationService();
  const checkpoints = [];
  for (let start = 0; start < 100_000; start += 1000) {
    const incoming = event(
      Array.from({ length: 1000 }, (_, offset) => trade(start + offset)),
      start + 1,
    );
    cache.apply(incoming);
    candles.apply(incoming);
    const stored = cache.getTrades("BTC-USD");
    assert.equal(stored.trades.length, 50);
    assert.equal(stored.trades[0].id, trade(start + 999).id);
    assert.equal(stored.trades.at(-1).id, trade(start + 950).id);
    assert.equal(cache.trades.size, 1);
    // Test-only retained-container inspection: no production diagnostics/getters are added.
    const seen = candles.seenTradesBySymbol.get("BTC-USD");
    assert.equal(seen.ids.size, Math.min(start + 1000, 5000));
    assert.equal(seen.order.length, seen.ids.size);
    assert.equal(candles.candlesBySymbol.get("BTC-USD").size, 4);
    if ([10_000, 50_000, 100_000].includes(start + 1000)) {
      checkpoints.push({
        processed: start + 1000,
        cached: stored.trades.length,
        seenIds: seen.ids.size,
        idQueue: seen.order.length,
        candles: 4,
      });
    }
  }
  assert.equal(candles.candlesBySymbol.get("BTC-USD").get("1h").candle.volume, "100000");
  const seen = candles.seenTradesBySymbol.get("BTC-USD");
  assert.equal(seen.ids.has(trade(0).id), false);
  assert.equal(seen.ids.has(trade(99999).id), true);
  assert.deepEqual(candles.apply(event([trade(99999)], 100_001)), []);
  t.diagnostic(JSON.stringify({ profile: "P03-backend", checkpoints }));
});

test("P03 cache keeps the newest unique trades with deterministic timestamp ties and defensive copies", () => {
  const cache = new MarketCacheService({});
  const incoming = event([
    ...Array.from({ length: 100 }, (_, index) => trade(index)),
    { ...trade(99), quantity: "2.50000000" },
    { ...trade(99), marketTs: startTs + 1, price: "1" },
    { ...trade(98), id: "aaa-tie", marketTs: startTs + 99 },
  ]);
  cache.apply(incoming);
  const stored = cache.getTrades(" btc-usd ");
  assert.equal(stored.trades.length, 50);
  assert.equal(new Set(stored.trades.map((item) => item.id)).size, 50);
  assert.equal(stored.trades[0].id, "aaa-tie");
  assert.equal(stored.trades[1].quantity, "2.50000000");
  assert.equal(stored.trades[1].price, "50000.00000001");
  incoming.trades[99].price = "9";
  incoming.trades.length = 0;
  stored.trades[1].price = "8";
  stored.trades.length = 0;
  assert.equal(cache.getTrades("BTC-USD").trades.length, 50);
  assert.equal(cache.getTrades("BTC-USD").trades[1].price, "50000.00000001");
});

test("P03 cache replaces rather than accumulates batches, isolates symbols and ignores older events", () => {
  const cache = new MarketCacheService({});
  for (const symbol of SUPPORTED_MARKET_SYMBOLS) {
    cache.apply(
      event(
        Array.from({ length: 100 }, (_, index) => trade(index, symbol)),
        1,
        symbol,
      ),
    );
    assert.equal(cache.getTrades(symbol).trades.length, 50);
  }
  assert.equal(cache.trades.size, 5);
  cache.apply(event([trade(100)], 2));
  assert.deepEqual(cache.getTrades("BTC-USD").trades, [trade(100)]);
  cache.apply(event([trade(0)], 3));
  assert.deepEqual(cache.getTrades("BTC-USD").trades, [trade(100)]);
  assert.equal(cache.getTrades("ETH-USD").trades.length, 50);
  cache.apply({ ...event([], 4), marketTs: startTs + 101 });
  assert.deepEqual(cache.getTrades("BTC-USD").trades, []);
  assert.equal(cache.getTrades("UNKNOWN-USD"), undefined);
});

test("P03 bootstrap truncation does not truncate live fan-out or candle volume", () => {
  const cache = new MarketCacheService({});
  const candles = new CandleAggregationService();
  const incoming = event(Array.from({ length: 200 }, (_, index) => trade(index)));
  cache.apply(incoming);
  assert.equal(cache.getTrades("BTC-USD").trades.length, 50);
  assert.equal(incoming.trades.length, 200);
  assert.equal(mapProviderEvent(incoming).data.trades.length, 200);
  const updates = candles.apply(incoming);
  assert.equal(updates.length, 4);
  for (const update of updates) assert.equal(update.candle.volume, "200");
});

test("P03 market cache releases its provider listener on shutdown without registering duplicates", () => {
  const listeners = new Set();
  const cache = new MarketCacheService({
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  cache.onModuleInit();
  cache.onModuleInit();
  assert.equal(listeners.size, 1);
  for (const listener of listeners) listener(event([trade(1)]));
  cache.onModuleDestroy();
  cache.onModuleDestroy();
  assert.equal(listeners.size, 0);
});
