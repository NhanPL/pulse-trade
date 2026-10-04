import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  formatWatchlistVolume,
  watchlistFreshnessKey,
  watchlistMarketIdentity,
  watchlistMarketStatus,
  watchlistTickerSymbols,
  watchlistTopMoverKey,
} = require("../.next/realtime-test/features/watchlist/model/watchlist-market.js");
const { tickerStore } = require("../.next/realtime-test/features/realtime/stores/ticker-store.js");

function state(changes) {
  const tickers = Object.fromEntries(
    Object.entries(changes).map(([symbol, change24hPercent]) => [
      symbol,
      { symbol, change24hPercent, price: "100", volume24h: "123.4567" },
    ]),
  );
  return {
    ...tickerStore.getState(),
    tickers,
    marketFreshness: Object.fromEntries(
      Object.keys(changes).map((symbol) => [symbol, { status: "LIVE", eventTs: 100 }]),
    ),
  };
}

test("watchlist metadata is local and subscription membership is supported, unique and sorted", () => {
  assert.deepEqual(watchlistMarketIdentity("BTC-USD"), {
    baseAsset: "BTC",
    quoteAsset: "USD",
    name: "Bitcoin",
  });
  assert.equal(watchlistMarketIdentity("RETIRED-USD").name, "RETIRED");
  assert.deepEqual(
    watchlistTickerSymbols(
      ["ETH-USD", "BTC-USD", "ETH-USD", "RETIRED-USD"].map((symbol) => ({ symbol })),
    ),
    ["BTC-USD", "ETH-USD"],
  );
});

test("top mover uses signed 24h change across saved symbols, with deterministic numeric ties", () => {
  const markets = state({
    "BTC-USD": "-20",
    "ETH-USD": "2.0",
    "SOL-USD": "2.00",
    "ADA-USD": "100",
  });
  assert.equal(watchlistTopMoverKey(["BTC-USD", "SOL-USD", "ETH-USD"], markets), "ETH-USD|2.0");
  assert.equal(watchlistTopMoverKey(["SOL-USD", "BTC-USD"], markets), "SOL-USD|2.00");
  assert.equal(watchlistTopMoverKey([], markets), "");
  assert.equal(
    watchlistTopMoverKey(["BTC-USD", "ETH-USD"], state({ "BTC-USD": "-2", "ETH-USD": "-4" })),
    "BTC-USD|-2",
  );
});

test("incomplete, stale or invalid quotes cannot produce a misleading top mover", () => {
  const symbols = ["BTC-USD", "ETH-USD"];
  assert.equal(watchlistTopMoverKey(symbols, state({ "BTC-USD": "1" })), "");
  const markets = state({ "BTC-USD": "1", "ETH-USD": "2" });
  markets.marketFreshness["BTC-USD"] = { status: "STALE", eventTs: 101, lastUpdateTs: 100 };
  assert.equal(watchlistTopMoverKey(symbols, markets), "");
  assert.equal(watchlistTopMoverKey(symbols, state({ "BTC-USD": "Infinity", "ETH-USD": "2" })), "");
});

test("freshness and summary selectors ignore price-only and unrelated market ticks", () => {
  const symbols = ["BTC-USD", "ETH-USD"];
  const markets = state({ "BTC-USD": "1", "ETH-USD": "2" });
  const previous = [
    watchlistFreshnessKey(symbols, markets),
    watchlistTopMoverKey(symbols, markets),
  ];
  markets.tickers["BTC-USD"].price = "999";
  markets.tickers["ADA-USD"] = { symbol: "ADA-USD", price: "1", change24hPercent: "99" };
  assert.deepEqual(
    [watchlistFreshnessKey(symbols, markets), watchlistTopMoverKey(symbols, markets)],
    previous,
  );
  markets.marketFreshness["BTC-USD"] = { status: "STALE", eventTs: 101, lastUpdateTs: 100 };
  assert.equal(watchlistFreshnessKey(symbols, markets), "Delayed|Live");
  assert.equal(watchlistFreshnessKey(["XRP-USD"], markets), "Waiting");
  assert.equal(watchlistFreshnessKey([], markets), "");
});

test("market state preserves last quotes but labels disconnects and staleness explicitly", () => {
  const ticker = state({ "BTC-USD": "1" }).tickers["BTC-USD"];
  assert.equal(watchlistMarketStatus(undefined, false, "CONNECTED"), "Waiting");
  assert.equal(watchlistMarketStatus(ticker, false, "CONNECTED"), "Live");
  assert.equal(watchlistMarketStatus(ticker, true, "CONNECTED"), "Delayed");
  for (const connection of ["CONNECTING", "RECONNECTING", "DISCONNECTED"])
    assert.equal(watchlistMarketStatus(ticker, false, connection), "Delayed");
});

test("24h volume is base-asset quantity, not mislabeled quote currency or zero when missing", () => {
  assert.equal(formatWatchlistVolume("1200.12345"), "1,200.1235");
  assert.equal(formatWatchlistVolume("0"), "0");
  for (const invalid of ["", " ", "NaN", "Infinity", "-1"])
    assert.equal(formatWatchlistVolume(invalid), "—");
});
