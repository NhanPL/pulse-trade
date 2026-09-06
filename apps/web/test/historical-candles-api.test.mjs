import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  fetchHistoricalCandles,
  HISTORICAL_CANDLE_LIMIT,
} = require("../.next/realtime-test/features/trading/api/historical-candles.js");

test("requests and validates bounded historical candles through the PulseTrade API", async (t) => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let request;

  globalThis.fetch = async (url, init) => {
    request = { init, url };

    return {
      json: async () => ({
        data: {
          candles: [
            {
              close: "101.25",
              high: "102.50",
              low: "99.75",
              open: "100.00",
              time: 1_700_000_000,
              volume: "42.00",
            },
          ],
          interval: "1m",
          symbol: "BTC-USD",
        },
      }),
      ok: true,
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const data = await fetchHistoricalCandles({
    interval: "1m",
    signal: controller.signal,
    symbol: "BTC-USD",
  });

  assert.equal(request.init.signal, controller.signal);
  assert.equal(
    request.url.toString(),
    `http://localhost:3001/api/v1/markets/BTC-USD/candles?interval=1m&limit=${HISTORICAL_CANDLE_LIMIT}`,
  );
  assert.deepEqual(data, {
    candles: [
      {
        close: "101.25",
        high: "102.50",
        low: "99.75",
        open: "100.00",
        time: 1_700_000_000,
        volume: "42.00",
      },
    ],
    interval: "1m",
    symbol: "BTC-USD",
  });
});
